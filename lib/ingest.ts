import 'server-only';
import type { InStatement } from '@libsql/client';
import { batch, get, nowIso, rowsOf } from './db';
import { auditStatement, N8N_ACTOR } from './audit';
import { env } from './env';
import { sendEmail } from './mailer';
import { postSlackMessage } from './slack';
import { getSettings } from './settings';
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
  system_error: 'high', parse_error: 'high', delivery_failed: 'high', blocked_keyword: 'high', policy: 'high', outside_hours: 'low',
};

const parse = (s: unknown) => { try { return typeof s === 'string' && s ? JSON.parse(s) : null; } catch { return null; } };

/**
 * Records one processed customer message from n8n (POST /api/internal/send-reply or /escalate).
 * The AI decision is kept in messages.meta_json of the assistant reply. Idempotent on
 * requestId (messages.request_id): an n8n retry never sends a second email or alert.
 */
export async function ingest(payload: InternalSendReply | InternalEscalate, kind: 'reply' | 'escalate'): Promise<IngestResult> {
  const conv = payload.conversation;
  const dup = await get<{ id: number }>('SELECT id FROM messages WHERE request_id = ?', [payload.requestId]);
  if (dup) return duplicate(payload, Number(dup.id));

  const settings = await getSettings();
  const now = nowIso();
  const isEscalation = kind === 'escalate';
  const d = payload.decision;
  const claude = (d.claude || null) as Record<string, unknown> | null;
  const gemini = (d.gemini || null) as Record<string, unknown> | null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const thread = payload.email ? { subject: payload.email.subject, inReplyTo: payload.email.inReplyTo || null, references: payload.email.references || [] } : null;
  const status = isEscalation ? 'escalated' : 'auto_replied';

  // 1. Conversation + customer message (reserves the requestId).
  let customerMessageId: number | null;
  try {
    const res = await batch([
      {
        sql: `INSERT INTO conversations (id, channel, customer_email, customer_name, oracle_customer_id, created_at, updated_at, status, last_message_at, email_thread_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                customer_email = COALESCE(excluded.customer_email, conversations.customer_email),
                customer_name = COALESCE(excluded.customer_name, conversations.customer_name),
                oracle_customer_id = COALESCE(excluded.oracle_customer_id, conversations.oracle_customer_id),
                updated_at = excluded.updated_at,
                status = CASE WHEN conversations.status IN ('escalated', 'open') AND excluded.status = 'auto_replied' THEN conversations.status ELSE excluded.status END, last_message_at = excluded.last_message_at,
                email_thread_json = COALESCE(excluded.email_thread_json, conversations.email_thread_json)`,
        args: [conv.id, conv.channel, conv.customerEmail, conv.customerName ?? null, conv.oracleCustomerId ?? null, payload.customerMessage.receivedAt, now, status, now, thread ? JSON.stringify(thread) : null],
      },
      {
        sql: "INSERT INTO messages (conversation_id, role, body, created_at, request_id) VALUES (?, 'customer', ?, ?, ?) RETURNING id",
        args: [conv.id, conv.subject && conv.channel === 'email' ? `Subject: ${conv.subject}\n\n${payload.customerMessage.body}` : payload.customerMessage.body, payload.customerMessage.receivedAt, payload.requestId],
      },
    ]);
    customerMessageId = Number(rowsOf<{ id: number }>(res[1])[0]?.id ?? 0) || null;
  } catch (e) {
    const again = /unique/i.test((e as Error).message) ? await get<{ id: number }>('SELECT id FROM messages WHERE request_id = ?', [payload.requestId]) : undefined;
    if (again) return duplicate(payload, Number(again.id));
    throw e;
  }

  // 2. Email delivery (chat was already answered by n8n's Respond to Webhook).
  let delivery: IngestResult['delivery'] = { status: 'not_applicable', messageId: null, error: null };
  if (payload.deliver && conv.channel === 'email' && payload.email) {
    try {
      const r = await sendEmail({
        to: payload.email.to, subject: payload.email.subject,
        text: payload.reply.text + (payload.email.quotedText || ''),
        html: payload.reply.html ? payload.reply.html + (payload.email.quotedHtml || '') : undefined,
        inReplyTo: payload.email.inReplyTo, references: payload.email.references, automated: true,
      });
      delivery = { status: 'sent', messageId: r.messageId, error: null };
    } catch (e) {
      delivery = { status: 'failed', messageId: null, error: (e as Error).message.slice(0, 500) };
    }
  }

  // 3. Assistant reply (with the decision), thread update, escalation.
  const failedDelivery = delivery.status === 'failed';
  const mustEscalate = isEscalation || failedDelivery;
  const esc = isEscalation ? (payload as InternalEscalate).escalation : null;
  const reasonCode = esc?.reasonCode ?? (failedDelivery ? 'delivery_failed' : d.reasonCode ?? null);
  const reason = esc ? esc.reason : failedDelivery ? `The automatic email reply could not be delivered: ${delivery.error}` : null;
  const priority = esc?.priority ?? (reasonCode ? DEFAULT_PRIORITY[reasonCode] ?? 'normal' : 'normal');
  const slaDue = new Date(Date.now() + settings.sla_minutes[priority] * 60_000).toISOString();
  const newThread = thread && delivery.messageId ? { ...thread, inReplyTo: delivery.messageId, references: [...thread.references, delivery.messageId].slice(-20) } : null;
  const meta = {
    requestId: payload.requestId, kind: isEscalation ? 'holding' : 'auto', delivery: delivery.status, error: delivery.error, sentMessageId: delivery.messageId,
    reasonCode, decision: { threshold: d.threshold ?? null, bothValid: d.bothValid, geminiAgrees: d.geminiAgrees, anyNeedsHuman: d.anyNeedsHuman, forceHuman: d.forceHuman, reasons: d.reasons, reasonCode },
    claude, gemini, n8n: payload.meta || {},
  };

  const statements: InStatement[] = [
    { sql: "INSERT INTO messages (conversation_id, role, body, created_at, meta_json) VALUES (?, 'assistant', ?, ?, ?) RETURNING id", args: [conv.id, payload.reply.text, nowIso(), JSON.stringify(meta)] },
  ];
  if (newThread) statements.push({ sql: 'UPDATE conversations SET email_thread_json = ? WHERE id = ? RETURNING id', args: [JSON.stringify(newThread), conv.id] });
  if (mustEscalate) {
    statements.push({ sql: "UPDATE conversations SET status = 'escalated' WHERE id = ? RETURNING id", args: [conv.id] });
    statements.push({
      sql: `INSERT INTO escalations (conversation_id, channel, claude_confidence, gemini_confidence, reason, gemini_issues, claude_draft, status, priority, sla_due_at, reason_code, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        conv.id, conv.channel, num(claude?.confidence), num(gemini?.confidence), reason, JSON.stringify(Array.isArray(gemini?.issues) ? gemini?.issues : []),
        typeof claude?.answer === 'string' ? claude.answer : null, priority, slaDue, reasonCode, nowIso(), nowIso(),
      ],
    });
  }
  const out = await batch(statements);
  const replyMessageId = Number(rowsOf<{ id: number }>(out[0])[0]?.id ?? 0) || null;
  const escalationId = mustEscalate ? Number(rowsOf<{ id: number }>(out[out.length - 1])[0]?.id ?? 0) || null : null;

  // 4. "Ask a person for help" alert in Slack.
  let slackTs: string | null = null;
  const notify = esc ? esc.notifySlack : failedDelivery;
  if (escalationId && notify && settings.slack_channel && env().SLACK_BOT_TOKEN) {
    const identity = (payload.meta?.identity || {}) as { verified?: boolean };
    const text = formatEscalationForSlack({
      id: escalationId, channel: conv.channel, conversationId: conv.id, customerName: conv.customerName ?? null, customerEmail: conv.customerEmail,
      verified: identity.verified === true, accountLookup: (payload.meta?.account_lookup as string) || null, reasonCode: reasonCode || 'unknown',
      reason: reason || '', priority, claudeConfidence: num(claude?.confidence), geminiConfidence: num(gemini?.confidence),
      geminiAgrees: typeof gemini?.agrees === 'boolean' ? gemini.agrees : null, geminiIssues: Array.isArray(gemini?.issues) ? gemini.issues.map(String) : [],
      customerMessage: payload.customerMessage.body, claudeDraft: typeof claude?.answer === 'string' ? claude.answer : null,
      receivedAt: payload.customerMessage.receivedAt, slaDueAt: slaDue, link: `${env().APP_URL}/conversations/${encodeURIComponent(conv.id)}`,
    });
    try {
      slackTs = await postSlackMessage(settings.slack_channel, text);
    } catch (e) {
      console.warn('[slack]', (e as Error).message);
    }
  }

  await batch([
    { sql: 'UPDATE messages SET meta_json = ? WHERE id = ?', args: [JSON.stringify({ ...meta, escalationId, slackTs }), replyMessageId] },
    ...(escalationId ? [{ sql: 'UPDATE escalations SET slack_ts = ? WHERE id = ?', args: [slackTs, escalationId] }] : []),
    auditStatement(N8N_ACTOR, isEscalation ? 'n8n.escalate' : 'n8n.reply', 'conversation', conv.id, null, { requestId: payload.requestId, delivery: delivery.status, escalationId, reasonCode }),
  ]);

  return { ok: true, conversationId: conv.id, customerMessageId, replyMessageId, delivery, escalationId, slackTs };
}

async function duplicate(payload: InternalSendReply, customerMessageId: number): Promise<IngestResult> {
  const reply = await get<{ id: number; meta_json: string | null }>(
    "SELECT id, meta_json FROM messages WHERE conversation_id = ? AND role = 'assistant' AND id > ? ORDER BY id ASC LIMIT 1",
    [payload.conversation.id, customerMessageId],
  );
  const meta = parse(reply?.meta_json) || {};
  return {
    ok: true, duplicate: true, conversationId: payload.conversation.id, customerMessageId, replyMessageId: reply ? Number(reply.id) : null,
    delivery: { status: meta.delivery || 'not_applicable', messageId: meta.sentMessageId ?? null, error: null },
    escalationId: meta.escalationId ?? null, slackTs: meta.slackTs ?? null,
  };
}
