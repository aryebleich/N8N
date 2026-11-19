import 'server-only';
import { all, batch, get, nowIso } from './db';
import { auditStatement, type Actor } from './audit';
import { HttpError } from './errors';
import { safeCustomerText } from './mask';
import { sendEmail, textToHtml } from './mailer';
import { getPromptBodies } from './prompts';
import { getSettings } from './settings';
import { renderTemplate } from './prompt-template';
import { whyFor } from './why';

/** The three badges the owner sees. Stored statuses: auto_replied | escalated | open | resolved. */
export type Bucket = 'auto' | 'waiting' | 'done';
export const bucketOf = (status: string): Bucket => (status === 'auto_replied' ? 'auto' : status === 'resolved' ? 'done' : 'waiting');
const BUCKET_SQL: Record<Bucket, string> = {
  auto: "c.status = 'auto_replied'",
  waiting: "c.status NOT IN ('auto_replied', 'resolved')",
  done: "c.status = 'resolved'",
};

export interface ConversationListItem {
  id: string; channel: 'email' | 'chat'; bucket: Bucket; customer: string; lastAt: string; preview: string; subject: string | null;
}

export const PAGE_SIZE = 25;

export async function listConversations(f: { channel?: 'email' | 'chat'; status?: Bucket; q?: string; page: number }) {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.channel) { where.push('c.channel = ?'); args.push(f.channel); }
  if (f.status) where.push(BUCKET_SQL[f.status]);
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    where.push('(lower(c.customer_email) LIKE ? OR lower(c.customer_name) LIKE ? OR EXISTS (SELECT 1 FROM messages mq WHERE mq.conversation_id = c.id AND lower(mq.body) LIKE ?))');
    args.push(like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await get<{ n: number }>(`SELECT count(*) AS n FROM conversations c ${w}`, args))?.n ?? 0);
  const rows = await all<{ id: string; channel: 'email' | 'chat'; status: string; customer_email: string | null; customer_name: string | null; last_at: string; preview: string | null; thread: string | null }>(
    `SELECT c.id, c.channel, c.status, c.customer_email, c.customer_name, c.email_thread_json AS thread,
            COALESCE(c.last_message_at, c.updated_at) AS last_at,
            (SELECT m.body FROM messages m WHERE m.conversation_id = c.id AND m.role = 'customer' ORDER BY m.id DESC LIMIT 1) AS preview
       FROM conversations c ${w}
      ORDER BY last_at DESC LIMIT ? OFFSET ?`,
    [...args, PAGE_SIZE, (f.page - 1) * PAGE_SIZE],
  );
  return {
    total,
    items: rows.map<ConversationListItem>((r) => ({
      id: r.id, channel: r.channel, bucket: bucketOf(r.status), lastAt: r.last_at,
      customer: r.customer_name || r.customer_email || (r.channel === 'chat' ? 'Website visitor' : 'Unknown sender'),
      preview: safeCustomerText((r.preview || '').replace(/^Subject: .*\n\n/, '').slice(0, 160)),
      subject: parse(r.thread)?.subject ?? null,
    })),
  };
}

const parse = (s: unknown) => {
  if (typeof s !== 'string' || !s) return null;
  try { return JSON.parse(s); } catch { return null; }
};

export interface AiCheck { confidence: number | null; needsHuman: boolean; agrees?: boolean; note: string }
export interface ConversationDetail {
  id: string; channel: 'email' | 'chat'; bucket: Bucket; customerName: string | null; customerEmail: string | null; subject: string | null; createdAt: string;
  messages: { id: number; role: 'customer' | 'assistant' | 'human'; body: string; createdAt: string; kind: string | null; delivery: string | null }[];
  draft: string | null;
  why: { title: string; text: string; details: string[]; threshold: number | null; claude: AiCheck | null; gemini: AiCheck | null } | null;
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const c = await get<Record<string, unknown>>('SELECT * FROM conversations WHERE id = ?', [id]);
  if (!c) return null;
  const msgs = await all<Record<string, unknown>>('SELECT id, role, body, created_at, meta_json FROM messages WHERE conversation_id = ? ORDER BY id ASC', [id]);
  const latestAi = [...msgs].reverse().map((m) => ({ m, meta: parse(m.meta_json) })).find((x) => x.m.role === 'assistant' && x.meta?.decision);
  const meta = latestAi?.meta as { decision?: Record<string, unknown>; claude?: Record<string, unknown>; gemini?: Record<string, unknown>; reasonCode?: string | null } | undefined;
  const d = meta?.decision;
  const claude = meta?.claude;
  const gemini = meta?.gemini;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const draft = typeof claude?.answer === 'string' && claude.answer.trim() ? claude.answer.trim() : null;
  const bucket = bucketOf(String(c.status || 'open'));
  const reasonCode = (meta?.reasonCode ?? (d?.reasonCode as string | null)) || null;
  return {
    id: String(c.id),
    channel: c.channel as 'email' | 'chat',
    bucket,
    customerName: (c.customer_name as string) || null,
    customerEmail: (c.customer_email as string) || null,
    subject: parse(c.email_thread_json)?.subject ?? null,
    createdAt: String(c.created_at),
    messages: msgs.map((m) => {
      const mm = parse(m.meta_json);
      return { id: Number(m.id), role: m.role as 'customer' | 'assistant' | 'human', body: safeCustomerText(String(m.body)), createdAt: String(m.created_at), kind: mm?.kind ?? null, delivery: mm?.delivery ?? null };
    }),
    draft: draft ? safeCustomerText(draft) : null,
    why: d
      ? {
          ...whyFor(reasonCode),
          details: Array.isArray(d.reasons) ? (d.reasons as unknown[]).map((r) => safeCustomerText(String(r))) : [],
          threshold: num(d.threshold),
          claude: claude ? { confidence: num(claude.confidence), needsHuman: claude.needs_human === true, note: typeof claude.reason === 'string' ? safeCustomerText(claude.reason) : '' } : null,
          gemini: gemini ? { confidence: num(gemini.confidence), needsHuman: gemini.needs_human === true, agrees: gemini.agrees === true, note: Array.isArray(gemini.issues) ? gemini.issues.map(String).join(' ') : '' } : null,
        }
      : null,
  };
}

/** Owner's reply. Email → sent over SMTP in the same thread. Chat → shown in the chat widget (and emailed if we know the address). */
export async function sendHumanReply(conversationId: string, body: string, source: 'draft' | 'edited' | 'manual', actor: Actor) {
  const c = await get<Record<string, unknown>>('SELECT * FROM conversations WHERE id = ?', [conversationId]);
  if (!c) throw new HttpError(404, 'This conversation no longer exists.');
  const to = c.customer_email as string | null;
  const [settings, prompts] = await Promise.all([getSettings(), getPromptBodies()]);
  const firstName = String(c.customer_name || '').trim().split(/\s+/)[0] || '';
  const signature = renderTemplate(prompts.email_signature || '', { company_name: settings.company_name }).trim();
  const thread = parse(c.email_thread_json) as { subject?: string; inReplyTo?: string; references?: string[] } | null;

  let delivery: 'sent' | 'failed' | 'chat' = 'chat';
  let deliveryError: string | null = null;
  let sentMessageId: string | null = null;
  if (c.channel === 'email' && !to) throw new HttpError(400, 'This conversation has no customer email address, so the reply cannot be sent.');
  if (to) {
    const text = `${firstName ? `Hi ${firstName},` : 'Hi,'}\n\n${body}\n\n${signature}`;
    const subject = c.channel === 'email' ? thread?.subject || 'Re: your message' : `Your chat with ${settings.company_name}`;
    try {
      const r = await sendEmail({ to, subject, text, html: textToHtml(text), inReplyTo: c.channel === 'email' ? thread?.inReplyTo : null, references: c.channel === 'email' ? thread?.references : [] });
      sentMessageId = r.messageId;
      delivery = 'sent';
    } catch (e) {
      deliveryError = (e as Error).message;
      if (c.channel === 'email') throw new HttpError(502, `The email could not be sent. ${deliveryError}`);
      delivery = 'chat';
    }
  }

  const now = nowIso();
  const newThread = thread && sentMessageId ? { ...thread, inReplyTo: sentMessageId, references: [...(thread.references || []), sentMessageId].slice(-20) } : thread;
  await batch([
    { sql: "INSERT INTO messages (conversation_id, role, body, created_at, author_id, meta_json) VALUES (?, 'human', ?, ?, ?, ?)", args: [conversationId, body, now, actor.id, JSON.stringify({ delivery, source, error: deliveryError })] },
    { sql: "UPDATE conversations SET status = 'resolved', updated_at = ?, last_message_at = ?, email_thread_json = ? WHERE id = ?", args: [now, now, newThread ? JSON.stringify(newThread) : null, conversationId] },
    { sql: "UPDATE escalations SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE conversation_id = ? AND status IN ('open', 'in_progress')", args: [now, now, conversationId] },
    auditStatement(actor, 'conversation.reply', 'conversation', conversationId, null, { source, length: body.length, delivery }),
  ]);
  return { delivery, error: deliveryError };
}

export async function setDone(conversationId: string, done: boolean, actor: Actor) {
  const c = await get<{ status: string }>('SELECT status FROM conversations WHERE id = ?', [conversationId]);
  if (!c) throw new HttpError(404, 'This conversation no longer exists.');
  const now = nowIso();
  const status = done ? 'resolved' : 'open';
  const statements = [
    { sql: 'UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?', args: [status, now, conversationId] },
    auditStatement(actor, done ? 'conversation.done' : 'conversation.reopen', 'conversation', conversationId, { status: c.status }, { status }),
  ];
  if (done) statements.push({ sql: "UPDATE escalations SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE conversation_id = ? AND status IN ('open', 'in_progress')", args: [now, now, conversationId] });
  await batch(statements);
}

/** Public widget polling: the owner's replies after `afterId`, chat conversations only. */
export async function humanRepliesForWidget(conversationId: string, afterId: number) {
  const c = await get<{ channel: string }>('SELECT channel FROM conversations WHERE id = ?', [conversationId]);
  if (!c || c.channel !== 'chat') return [];
  const rows = await all<{ id: number; body: string; created_at: string }>(
    "SELECT id, body, created_at FROM messages WHERE conversation_id = ? AND role = 'human' AND id > ? ORDER BY id ASC LIMIT 20",
    [conversationId, afterId],
  );
  return rows.map((r) => ({ id: Number(r.id), text: r.body, createdAt: r.created_at }));
}
