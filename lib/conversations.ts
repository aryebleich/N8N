import 'server-only';
import { all, batch, get, nowIso, run } from './db';
import { auditStatement, type Actor } from './audit';
import { eventStatement } from './events';
import { ApiError } from './api';
import { maskEmail, safeCustomerText, scrubObject } from './mask';
import { sendEmail } from './mailer';
import { recordStatus } from './health';
import { getPromptBodies } from './prompts';
import { getSettings } from './settings';
import { renderTemplate } from './prompt-template';

export interface ConversationListItem {
  id: string;
  channel: 'email' | 'chat';
  status: string;
  customer: string;
  customerName: string | null;
  assignee: string | null;
  lastAt: string;
  preview: string;
  messageCount: number;
  openEscalations: number;
}

export interface ConversationFilter {
  channel?: 'email' | 'chat';
  status?: string;
  from?: string;
  to?: string;
  q?: string;
  page: number;
}

export const PAGE_SIZE = 25;

export async function listConversations(f: ConversationFilter): Promise<{ items: ConversationListItem[]; total: number }> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.channel) { where.push('c.channel = ?'); args.push(f.channel); }
  if (f.status) { where.push('c.status = ?'); args.push(f.status); }
  if (f.from) { where.push('COALESCE(c.last_message_at, c.updated_at) >= ?'); args.push(`${f.from}T00:00:00.000Z`); }
  if (f.to) { where.push('COALESCE(c.last_message_at, c.updated_at) <= ?'); args.push(`${f.to}T23:59:59.999Z`); }
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    where.push('(lower(c.customer_email) LIKE ? OR lower(c.customer_name) LIKE ? OR lower(c.id) LIKE ? OR EXISTS (SELECT 1 FROM messages mq WHERE mq.conversation_id = c.id AND lower(mq.body) LIKE ?))');
    args.push(like, like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await get<{ n: number }>(`SELECT count(*) AS n FROM conversations c ${w}`, args))?.n ?? 0);
  const rows = await all<{
    id: string; channel: 'email' | 'chat'; status: string; customer_email: string | null; customer_name: string | null;
    assignee: string | null; last_at: string; preview: string | null; n: number; open_esc: number;
  }>(
    `SELECT c.id, c.channel, c.status, c.customer_email, c.customer_name,
            COALESCE(u.name, u.email) AS assignee,
            COALESCE(c.last_message_at, c.updated_at) AS last_at,
            (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS preview,
            (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) AS n,
            (SELECT count(*) FROM escalations e WHERE e.conversation_id = c.id AND e.status IN ('open', 'in_progress')) AS open_esc
       FROM conversations c LEFT JOIN users u ON u.id = c.assignee_id
       ${w}
      ORDER BY last_at DESC
      LIMIT ? OFFSET ?`,
    [...args, PAGE_SIZE, (f.page - 1) * PAGE_SIZE],
  );
  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      status: r.status,
      customer: maskEmail(r.customer_email) || 'unknown',
      customerName: r.customer_name,
      assignee: r.assignee,
      lastAt: r.last_at,
      preview: safeCustomerText((r.preview || '').slice(0, 160)),
      messageCount: Number(r.n),
      openEscalations: Number(r.open_esc),
    })),
  };
}

export interface ConversationDetail {
  id: string;
  channel: 'email' | 'chat';
  status: string;
  customer: string;
  customerName: string | null;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  oracleCustomerId: string | null;
  messages: { id: number; role: 'customer' | 'assistant' | 'human'; body: string; createdAt: string; author: string | null; delivery: string | null }[];
  notes: { id: number; body: string; author: string; createdAt: string }[];
  decisions: {
    id: number; outcome: string; reasonCode: string | null; reason: string | null;
    claude: Record<string, unknown> | null; gemini: Record<string, unknown> | null;
    claudeConfidence: number | null; geminiConfidence: number | null; threshold: number | null;
    deliveryStatus: string | null; deliveryError: string | null; createdAt: string; meta: Record<string, unknown> | null;
  }[];
  account: { full_name?: string; plan?: string; status?: string; customer_id?: string; orders?: Record<string, unknown>[] } | null;
  escalations: { id: number; status: string; priority: string; reasonCode: string | null; slaDueAt: string | null; createdAt: string }[];
}

const parse = (s: unknown) => {
  if (typeof s !== 'string' || !s) return null;
  try { return JSON.parse(s); } catch { return null; }
};

/** Every customer-written string is scrubbed (payment data) and email-masked before it leaves the server. */
export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const c = await get<Record<string, unknown>>('SELECT * FROM conversations WHERE id = ?', [id]);
  if (!c) return null;
  const [messages, notes, decisions, escalations] = await Promise.all([
    all<Record<string, unknown>>(
      'SELECT m.id, m.role, m.body, m.created_at, m.meta_json, COALESCE(u.name, u.email) AS author FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.conversation_id = ? ORDER BY m.id ASC',
      [id],
    ),
    all<Record<string, unknown>>(
      'SELECT n.id, n.body, n.created_at, COALESCE(u.name, u.email, n.author_id) AS author FROM conversation_notes n LEFT JOIN users u ON u.id = n.author_id WHERE n.conversation_id = ? ORDER BY n.id ASC',
      [id],
    ),
    all<Record<string, unknown>>('SELECT * FROM ai_decisions WHERE conversation_id = ? ORDER BY id DESC LIMIT 20', [id]),
    all<Record<string, unknown>>('SELECT id, status, priority, reason_code, sla_due_at, created_at FROM escalations WHERE conversation_id = ? ORDER BY id DESC', [id]),
  ]);
  const latestAccount = decisions.map((d) => parse(d.account_json)).find(Boolean) as ConversationDetail['account'];
  const account = latestAccount
    ? scrubObject({ ...latestAccount, orders: Array.isArray(latestAccount.orders) ? latestAccount.orders.slice(0, 3) : [] })
    : null;
  const scrubModel = (o: Record<string, unknown> | null) => {
    if (!o) return null;
    const copy = scrubObject(o);
    if (typeof copy.answer === 'string') copy.answer = safeCustomerText(copy.answer);
    if (typeof copy.reason === 'string') copy.reason = safeCustomerText(copy.reason);
    if (Array.isArray(copy.issues)) copy.issues = copy.issues.map((i) => safeCustomerText(String(i)));
    return copy;
  };
  return {
    id: String(c.id),
    channel: c.channel as 'email' | 'chat',
    status: String(c.status || 'open'),
    customer: maskEmail(c.customer_email as string) || 'unknown',
    customerName: (c.customer_name as string) || null,
    assigneeId: (c.assignee_id as string) || null,
    createdAt: String(c.created_at),
    updatedAt: String(c.updated_at),
    oracleCustomerId: (c.oracle_customer_id as string) || null,
    messages: messages.map((m) => ({
      id: Number(m.id),
      role: m.role as 'customer' | 'assistant' | 'human',
      body: safeCustomerText(String(m.body)),
      createdAt: String(m.created_at),
      author: (m.author as string) || null,
      delivery: (parse(m.meta_json)?.delivery as string) || null,
    })),
    notes: notes.map((n) => ({ id: Number(n.id), body: safeCustomerText(String(n.body)), author: String(n.author), createdAt: String(n.created_at) })),
    decisions: decisions.map((d) => ({
      id: Number(d.id),
      outcome: String(d.outcome),
      reasonCode: (d.reason_code as string) || null,
      reason: d.reason ? safeCustomerText(String(d.reason)) : null,
      claude: scrubModel(parse(d.claude_json)),
      gemini: scrubModel(parse(d.gemini_json)),
      claudeConfidence: d.claude_confidence == null ? null : Number(d.claude_confidence),
      geminiConfidence: d.gemini_confidence == null ? null : Number(d.gemini_confidence),
      threshold: d.threshold == null ? null : Number(d.threshold),
      deliveryStatus: (d.delivery_status as string) || null,
      deliveryError: (d.delivery_error as string) || null,
      createdAt: String(d.created_at),
      meta: parse(d.meta_json),
    })),
    account,
    escalations: escalations.map((e) => ({
      id: Number(e.id), status: String(e.status), priority: String(e.priority), reasonCode: (e.reason_code as string) || null,
      slaDueAt: (e.sla_due_at as string) || null, createdAt: String(e.created_at),
    })),
  };
}

/** Latest usable Claude draft for "approve and send", unmasked (server-side only). */
export async function latestDraft(conversationId: string): Promise<string | null> {
  const d = await get<{ claude_json: string | null }>("SELECT claude_json FROM ai_decisions WHERE conversation_id = ? AND claude_json IS NOT NULL ORDER BY id DESC LIMIT 1", [conversationId]);
  const parsed = parse(d?.claude_json);
  return typeof parsed?.answer === 'string' && parsed.answer.trim() ? parsed.answer.trim() : null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Human reply: email channel → SMTP with threading headers; chat → stored for the widget, with an email copy. */
export async function sendHumanReply(conversationId: string, body: string, source: 'draft' | 'edited' | 'manual', actor: Actor) {
  const c = await get<Record<string, unknown>>('SELECT * FROM conversations WHERE id = ?', [conversationId]);
  if (!c) throw new ApiError(404, 'Conversation not found.');
  const to = c.customer_email as string | null;
  const settings = await getSettings();
  const prompts = await getPromptBodies();
  const firstName = String(c.customer_name || '').trim().split(/\s+/)[0] || '';
  const signature = renderTemplate(prompts.email_signature || '', { company_name: settings.company_name });
  const thread = parse(c.email_thread_json) as { subject?: string; inReplyTo?: string; references?: string[] } | null;

  let delivery: 'sent' | 'failed' | 'stored' = 'stored';
  let deliveryError: string | null = null;
  let sentMessageId: string | null = null;
  if (to) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    const text = `${greeting}\n\n${body}\n\n${signature}`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2328">${text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
    const subject = c.channel === 'email' ? thread?.subject || 'Re: your message' : `Your chat with ${settings.company_name} support`;
    const started = Date.now();
    try {
      const r = await sendEmail({ to, subject, text, html, inReplyTo: c.channel === 'email' ? thread?.inReplyTo : null, references: c.channel === 'email' ? thread?.references : [] });
      sentMessageId = r.messageId;
      delivery = 'sent';
      await recordStatus('smtp', true, Date.now() - started, null);
    } catch (e) {
      deliveryError = (e as Error).message;
      delivery = c.channel === 'chat' ? 'stored' : 'failed';
      await recordStatus('smtp', false, Date.now() - started, deliveryError);
      if (c.channel === 'email') throw new ApiError(502, `The email could not be sent: ${deliveryError}`);
    }
  } else if (c.channel === 'email') {
    throw new ApiError(400, 'This conversation has no customer email address.');
  }

  const now = nowIso();
  const newThread = thread && sentMessageId ? { ...thread, inReplyTo: sentMessageId, references: [...(thread.references || []), sentMessageId].slice(-20) } : thread;
  await batch([
    { sql: "INSERT INTO messages (conversation_id, role, body, created_at, author_id, meta_json) VALUES (?, 'human', ?, ?, ?, ?)", args: [conversationId, body, now, actor.id, JSON.stringify({ delivery, source, error: deliveryError })] },
    { sql: "UPDATE conversations SET status = 'open', updated_at = ?, last_message_at = ?, email_thread_json = ?, assignee_id = COALESCE(assignee_id, ?) WHERE id = ?", args: [now, now, newThread ? JSON.stringify(newThread) : null, actor.id, conversationId] },
    { sql: "UPDATE escalations SET status = 'in_progress', assignee_id = COALESCE(assignee_id, ?), updated_at = ? WHERE conversation_id = ? AND status = 'open'", args: [actor.id, now, conversationId] },
    auditStatement(actor, 'conversation.reply', 'conversation', conversationId, null, { source, length: body.length, delivery }),
    eventStatement('message.created', conversationId, { role: 'human' }),
  ]);
  return { delivery, error: deliveryError };
}

export async function setConversationStatus(conversationId: string, status: 'resolved' | 'open', actor: Actor) {
  const c = await get<{ status: string }>('SELECT status FROM conversations WHERE id = ?', [conversationId]);
  if (!c) throw new ApiError(404, 'Conversation not found.');
  const now = nowIso();
  const statements = [
    { sql: 'UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?', args: [status, now, conversationId] },
    auditStatement(actor, status === 'resolved' ? 'conversation.resolve' : 'conversation.reopen', 'conversation', conversationId, { status: c.status }, { status }),
    eventStatement('conversation.updated', conversationId, { status }),
  ];
  if (status === 'resolved') {
    statements.push({ sql: "UPDATE escalations SET status = 'resolved', resolved_at = ?, resolved_by = ?, updated_at = ? WHERE conversation_id = ? AND status IN ('open', 'in_progress')", args: [now, actor.id, now, conversationId] });
  }
  await batch(statements);
}

export async function addNote(conversationId: string, body: string, actor: Actor) {
  const c = await get('SELECT id FROM conversations WHERE id = ?', [conversationId]);
  if (!c) throw new ApiError(404, 'Conversation not found.');
  await batch([
    { sql: 'INSERT INTO conversation_notes (conversation_id, author_id, body, created_at) VALUES (?, ?, ?, ?)', args: [conversationId, actor.id, body, nowIso()] },
    auditStatement(actor, 'conversation.note', 'conversation', conversationId, null, { length: body.length }),
    eventStatement('note.created', conversationId, {}),
  ]);
}

export async function assignConversation(conversationId: string, userId: string | null, actor: Actor) {
  const c = await get<{ assignee_id: string | null }>('SELECT assignee_id FROM conversations WHERE id = ?', [conversationId]);
  if (!c) throw new ApiError(404, 'Conversation not found.');
  if (userId) {
    const u = await get('SELECT id FROM users WHERE id = ? AND active = 1', [userId]);
    if (!u) throw new ApiError(400, 'That teammate does not exist or is deactivated.');
  }
  const now = nowIso();
  await batch([
    { sql: 'UPDATE conversations SET assignee_id = ?, updated_at = ? WHERE id = ?', args: [userId, now, conversationId] },
    { sql: "UPDATE escalations SET assignee_id = ?, updated_at = ? WHERE conversation_id = ? AND status IN ('open', 'in_progress')", args: [userId, now, conversationId] },
    auditStatement(actor, 'conversation.assign', 'conversation', conversationId, { assignee_id: c.assignee_id }, { assignee_id: userId }),
    eventStatement('conversation.updated', conversationId, { assignee: userId }),
  ]);
}

/** Public widget polling: human replies after `afterId`, for chat conversations only. */
export async function humanRepliesForWidget(conversationId: string, afterId: number) {
  const c = await get<{ channel: string }>('SELECT channel FROM conversations WHERE id = ?', [conversationId]);
  if (!c || c.channel !== 'chat') return [];
  const rows = await all<{ id: number; body: string; created_at: string }>(
    "SELECT id, body, created_at FROM messages WHERE conversation_id = ? AND role = 'human' AND id > ? ORDER BY id ASC LIMIT 20",
    [conversationId, afterId],
  );
  return rows.map((r) => ({ id: Number(r.id), text: r.body, createdAt: r.created_at }));
}

export async function conversationExists(id: string) {
  return !!(await get('SELECT 1 AS x FROM conversations WHERE id = ?', [id]));
}

export async function touchConversation(id: string) {
  await run('UPDATE conversations SET updated_at = ? WHERE id = ?', [nowIso(), id]);
}
