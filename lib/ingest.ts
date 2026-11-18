import 'server-only';
import { batch, get, nowIso, run, rowsOf } from './db';
import { auditStatement, N8N_ACTOR } from './audit';
import { eventStatement } from './events';
import { env } from './env';
import { sendEmail } from './mailer';
import { postSlackMessage } from './slack';
import { recordStatus } from './health';
import { getSettings } from './settings';
import { scrubObject } from './mask';
import { formatEscalationForSlack } from './slack-format';
import type { InternalEscalate, InternalSendReply } from './validators';

export interface IngestResult {
  ok: true;
  duplicate?: boolean;
  conversationId: string;
  customerMessageId: number | null;
  replyMessageId: number | null;
  delivery: { status: 'sent' | 'failed' | 'not_applicable'; messageId: string | null; error: string | null };
  escalationId: number | null;
  slackTs: string | null;
}

const DEFAULT_PRIORITY: Record<string, 'high' | 'normal' | 'low'> = {
  system_error: 'high',
  parse_error: 'high',
  delivery_failed: 'high',
  blocked_keyword: 'high',
  policy: 'high',
  outside_hours: 'low',
};

/**
 * Records one processed message from n8n. For email with deliver=true the site sends the
 * reply over SMTP (with In-Reply-To/References). Idempotent on requestId: an n8n retry
 * never sends a second email or creates a second escalation.
 */
export async function ingest(payload: InternalSendReply | InternalEscalate, kind: 'reply' | 'escalate'): Promise<IngestResult> {
  const conv = payload.conversation;
  const existing = await get<{ id: number; message_id: number | null; delivery_status: string | null; meta_json: string | null }>(
    'SELECT id, message_id, delivery_status, meta_json FROM ai_decisions WHERE request_id = ?',
    [payload.requestId],
  );
  if (existing) {
    const meta = existing.meta_json ? JSON.parse(existing.meta_json) : {};
    return {
      ok: true, duplicate: true, conversationId: conv.id, customerMessageId: existing.message_id, replyMessageId: meta.replyMessageId ?? null,
      delivery: { status: (existing.delivery_status as 'sent' | 'failed' | 'not_applicable') || 'not_applicable', messageId: meta.sentMessageId ?? null, error: null },
      escalationId: meta.escalationId ?? null, slackTs: meta.slackTs ?? null,
    };
  }

  const settings = await getSettings();
  const now = nowIso();
  const isEscalation = kind === 'escalate';
  const d = payload.decision;
  const claude = (d.claude || null) as Record<string, unknown> | null;
  const gemini = (d.gemini || null) as Record<string, unknown> | null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const thread = payload.email
    ? { subject: payload.email.subject, inReplyTo: payload.email.inReplyTo || null, references: payload.email.references || [] }
    : null;

  // 1. Conversation + customer message + decision row (reserves the requestId).
  const status = isEscalation ? 'escalated' : 'auto_replied';
  const meta = { ...(payload.meta || {}), reasons: d.reasons };
  const res = await batch([
    {
      sql: `INSERT INTO conversations (id, channel, customer_email, customer_name, oracle_customer_id, created_at, updated_at, status, last_message_at, email_thread_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              customer_email = COALESCE(excluded.customer_email, conversations.customer_email),
              customer_name = COALESCE(excluded.customer_name, conversations.customer_name),
              oracle_customer_id = COALESCE(excluded.oracle_customer_id, conversations.oracle_customer_id),
              updated_at = excluded.updated_at,
              status = CASE WHEN conversations.status = 'escalated' AND excluded.status = 'auto_replied' THEN 'escalated' ELSE excluded.status END,
              last_message_at = excluded.last_message_at,
              email_thread_json = COALESCE(excluded.email_thread_json, conversations.email_thread_json)`,
      args: [conv.id, conv.channel, conv.customerEmail, conv.customerName ?? null, conv.oracleCustomerId ?? null, payload.customerMessage.receivedAt, now, status, now, thread ? JSON.stringify(thread) : null],
    },
    {
      sql: "INSERT INTO messages (conversation_id, role, body, created_at) VALUES (?, 'customer', ?, ?) RETURNING id",
      args: [conv.id, conv.subject && conv.channel === 'email' ? `Subject: ${conv.subject}\n\n${payload.customerMessage.body}` : payload.customerMessage.body, payload.customerMessage.receivedAt],
    },
  ]);
  const customerMessageId = Number(rowsOf<{ id: number }>(res[1])[0]?.id ?? 0) || null;
  const responseMs = Math.max(0, Date.now() - new Date(payload.customerMessage.receivedAt).getTime());
  await run(
    `INSERT INTO ai_decisions (request_id, conversation_id, message_id, channel, outcome, reason, reason_code, claude_json, gemini_json,
       claude_confidence, gemini_confidence, both_valid, gemini_agrees, any_needs_human, force_human, threshold, account_json, meta_json,
       delivery_status, response_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      payload.requestId, conv.id, customerMessageId, conv.channel, isEscalation ? 'escalated' : 'auto',
      isEscalation ? (payload as InternalEscalate).escalation.reason : d.reasons.join('; ') || 'All checks passed',
      isEscalation ? (payload as InternalEscalate).escalation.reasonCode : d.reasonCode ?? null,
      claude ? JSON.stringify(claude) : null, gemini ? JSON.stringify(gemini) : null,
      num(claude?.confidence), num(gemini?.confidence), d.bothValid ? 1 : 0, d.geminiAgrees ? 1 : 0, d.anyNeedsHuman ? 1 : 0, d.forceHuman ? 1 : 0,
      d.threshold ?? null, payload.account ? JSON.stringify(scrubObject(payload.account)) : null, JSON.stringify(meta), responseMs, now,
    ],
  );

  // 2. Delivery (email only; chat was already answered by Respond to Webhook).
  let delivery: IngestResult['delivery'] = { status: 'not_applicable', messageId: null, error: null };
  if (payload.deliver && conv.channel === 'email' && payload.email) {
    const started = Date.now();
    try {
      const r = await sendEmail({
        to: payload.email.to,
        subject: payload.email.subject,
        text: payload.reply.text + (payload.email.quotedText || ''),
        html: payload.reply.html ? payload.reply.html + (payload.email.quotedHtml || '') : undefined,
        inReplyTo: payload.email.inReplyTo,
        references: payload.email.references,
        automated: true,
      });
      delivery = { status: 'sent', messageId: r.messageId, error: null };
      await recordStatus('smtp', true, Date.now() - started, null);
    } catch (e) {
      delivery = { status: 'failed', messageId: null, error: (e as Error).message.slice(0, 500) };
      await recordStatus('smtp', false, Date.now() - started, delivery.error);
    }
  }

  // 3. Reply message, thread update, escalation.
  const failedDelivery = delivery.status === 'failed';
  const mustEscalate = isEscalation || failedDelivery;
  const esc = isEscalation ? (payload as InternalEscalate).escalation : null;
  const reasonCode = esc?.reasonCode ?? (failedDelivery ? 'delivery_failed' : null);
  const reason = esc ? esc.reason : failedDelivery ? `The automatic email reply could not be delivered: ${delivery.error}` : null;
  const priority = esc?.priority ?? (reasonCode ? DEFAULT_PRIORITY[reasonCode] ?? 'normal' : 'normal');
  const slaDue = new Date(Date.now() + settings.sla_minutes[priority] * 60_000).toISOString();
  const newThread = thread && delivery.messageId ? { ...thread, inReplyTo: delivery.messageId, references: [...thread.references, delivery.messageId].slice(-20) } : null;

  const statements = [
    {
      sql: "INSERT INTO messages (conversation_id, role, body, created_at, meta_json) VALUES (?, 'assistant', ?, ?, ?) RETURNING id",
      args: [conv.id, payload.reply.text, nowIso(), JSON.stringify({ delivery: delivery.status, kind: isEscalation ? 'holding' : 'auto', error: delivery.error })],
    },
    { sql: 'UPDATE ai_decisions SET delivery_status = ?, delivery_error = ? WHERE request_id = ?', args: [delivery.status, delivery.error, payload.requestId] },
    eventStatement('message.created', conv.id, { role: 'customer', channel: conv.channel }),
    eventStatement('message.created', conv.id, { role: 'assistant', channel: conv.channel, outcome: isEscalation ? 'escalated' : 'auto' }),
  ];
  if (newThread) statements.push({ sql: 'UPDATE conversations SET email_thread_json = ? WHERE id = ?', args: [JSON.stringify(newThread), conv.id] });
  if (mustEscalate) {
    statements.push({ sql: "UPDATE conversations SET status = 'escalated' WHERE id = ?", args: [conv.id] });
    statements.push({
      sql: `INSERT INTO escalations (conversation_id, channel, claude_confidence, gemini_confidence, reason, gemini_issues, claude_draft,
              status, priority, sla_due_at, reason_code, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        conv.id, conv.channel, num(claude?.confidence), num(gemini?.confidence), reason,
        JSON.stringify(Array.isArray(gemini?.issues) ? gemini?.issues : []), typeof claude?.answer === 'string' ? claude.answer : null,
        priority, slaDue, reasonCode, nowIso(), nowIso(),
      ],
    });
  }
  const out = await batch(statements);
  const replyMessageId = Number(rowsOf<{ id: number }>(out[0])[0]?.id ?? 0) || null;
  const escalationId = mustEscalate ? Number(rowsOf<{ id: number }>(out[out.length - 1])[0]?.id ?? 0) || null : null;

  // 4. Slack notification for escalations.
  let slackTs: string | null = null;
  const notify = esc ? esc.notifySlack : failedDelivery;
  if (escalationId && notify && settings.slack_channel_id) {
    const identity = (payload.meta?.identity || {}) as { verified?: boolean };
    const text = formatEscalationForSlack({
      id: escalationId, channel: conv.channel, conversationId: conv.id, customerName: conv.customerName ?? null, customerEmail: conv.customerEmail,
      verified: identity.verified === true, accountLookup: (payload.meta?.account_lookup as string) || null, reasonCode: reasonCode || 'unknown',
      reason: reason || '', priority, claudeConfidence: num(claude?.confidence), geminiConfidence: num(gemini?.confidence),
      geminiAgrees: typeof gemini?.agrees === 'boolean' ? gemini.agrees : null, geminiIssues: Array.isArray(gemini?.issues) ? gemini.issues.map(String) : [],
      customerMessage: payload.customerMessage.body, claudeDraft: typeof claude?.answer === 'string' ? claude.answer : null,
      receivedAt: payload.customerMessage.receivedAt, slaDueAt: slaDue, link: `${env().APP_URL}/conversations/${encodeURIComponent(conv.id)}`,
    });
    const started = Date.now();
    try {
      slackTs = await postSlackMessage(settings.slack_channel_id, text);
      await recordStatus('slack', true, Date.now() - started, null);
    } catch (e) {
      await recordStatus('slack', false, Date.now() - started, (e as Error).message);
    }
  }

  const finalStatements = [
    { sql: 'UPDATE ai_decisions SET meta_json = ? WHERE request_id = ?', args: [JSON.stringify({ ...meta, replyMessageId, escalationId, slackTs, sentMessageId: delivery.messageId }), payload.requestId] },
    auditStatement(N8N_ACTOR, isEscalation ? 'n8n.escalate' : 'n8n.reply', 'conversation', conv.id, null, { requestId: payload.requestId, delivery: delivery.status, escalationId, reasonCode }),
  ];
  if (escalationId) {
    finalStatements.push({ sql: 'UPDATE escalations SET slack_ts = ? WHERE id = ?', args: [slackTs, escalationId] });
    finalStatements.push(eventStatement('escalation.created', conv.id, { id: escalationId, reasonCode, priority }));
  }
  await batch(finalStatements);

  return { ok: true, conversationId: conv.id, customerMessageId, replyMessageId, delivery, escalationId, slackTs };
}
