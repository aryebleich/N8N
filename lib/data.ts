import 'server-only';
import { all, batch, get, nowIso } from './db';
import { auditStatement, type Actor } from './audit';
import { maskEmail, safeCustomerText } from './mask';
import { toCsv } from './csv';

const range = (from: string, to: string) => [`${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`];

/** One row per message. Emails are masked and payment data scrubbed. */
export async function exportConversationsCsv(from: string, to: string): Promise<{ csv: string; rows: number }> {
  const rows = await all<Record<string, unknown>>(
    `SELECT c.id AS conversation_id, c.channel, c.status, c.customer_email, c.customer_name, m.id AS message_id, m.role, m.created_at, m.body
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.created_at BETWEEN ? AND ?
      ORDER BY c.id, m.id LIMIT 200000`,
    range(from, to),
  );
  const csv = toCsv(
    ['conversation_id', 'channel', 'status', 'customer_email_masked', 'customer_name', 'message_id', 'role', 'created_at', 'body'],
    rows.map((r) => [r.conversation_id, r.channel, r.status, maskEmail(r.customer_email as string), r.customer_name, r.message_id, r.role, r.created_at, safeCustomerText(String(r.body))]),
  );
  return { csv, rows: rows.length };
}

export async function exportEscalationsCsv(from: string, to: string): Promise<{ csv: string; rows: number }> {
  const rows = await all<Record<string, unknown>>(
    `SELECT e.*, c.customer_email, COALESCE(u.email, e.assignee_id) AS assignee
       FROM escalations e LEFT JOIN conversations c ON c.id = e.conversation_id LEFT JOIN users u ON u.id = e.assignee_id
      WHERE e.created_at BETWEEN ? AND ? ORDER BY e.id LIMIT 200000`,
    range(from, to),
  );
  const csv = toCsv(
    ['id', 'conversation_id', 'channel', 'status', 'priority', 'reason_code', 'reason', 'claude_confidence', 'gemini_confidence', 'assignee', 'customer_email_masked', 'sla_due_at', 'slack_ts', 'created_at', 'resolved_at'],
    rows.map((r) => [r.id, r.conversation_id, r.channel, r.status, r.priority, r.reason_code, safeCustomerText(String(r.reason || '')), r.claude_confidence, r.gemini_confidence, r.assignee, maskEmail(r.customer_email as string), r.sla_due_at, r.slack_ts, r.created_at, r.resolved_at]),
  );
  return { csv, rows: rows.length };
}

export async function customerDataCounts(email: string) {
  const conv = await all<{ id: string }>('SELECT id FROM conversations WHERE lower(customer_email) = lower(?)', [email]);
  const ids = conv.map((c) => c.id);
  const ph = ids.map(() => '?').join(',') || "''";
  const [m, t] = await Promise.all([
    ids.length ? get<{ n: number }>(`SELECT count(*) AS n FROM messages WHERE conversation_id IN (${ph})`, ids) : Promise.resolve({ n: 0 }),
    get<{ n: number }>('SELECT count(*) AS n FROM session_tokens WHERE lower(customer_email) = lower(?)', [email]),
  ]);
  return { ids, conversations: ids.length, messages: Number(m?.n ?? 0), sessionTokens: Number(t?.n ?? 0) };
}

/** Deletes a customer's Turso data. Oracle is read-only and is never touched. */
export async function deleteCustomerData(email: string, actor: Actor) {
  const counts = await customerDataCounts(email);
  const ph = counts.ids.map(() => '?').join(',');
  const statements = [];
  if (counts.ids.length) {
    for (const table of ['messages', 'ai_decisions', 'conversation_notes', 'escalations', 'events']) {
      statements.push({ sql: `DELETE FROM ${table} WHERE conversation_id IN (${ph})`, args: counts.ids });
    }
    statements.push({ sql: `DELETE FROM conversations WHERE id IN (${ph})`, args: counts.ids });
  }
  statements.push({ sql: 'DELETE FROM session_tokens WHERE lower(customer_email) = lower(?)', args: [email] });
  statements.push(auditStatement(actor, 'data.delete_customer', 'customer', maskEmail(email), null, { conversations: counts.conversations, messages: counts.messages, sessionTokens: counts.sessionTokens }));
  await batch(statements);
  return { conversations: counts.conversations, messages: counts.messages, sessionTokens: counts.sessionTokens };
}

export async function retentionPreview(days: number) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const m = await get<{ n: number }>('SELECT count(*) AS n FROM messages WHERE created_at < ?', [cutoff]);
  return { cutoff, messages: Number(m?.n ?? 0) };
}

/** Deletes messages (and their decisions/events) older than `days`, then empty conversations. */
export async function applyRetention(days: number, actor: Actor) {
  const { cutoff, messages } = await retentionPreview(days);
  await batch([
    { sql: 'DELETE FROM messages WHERE created_at < ?', args: [cutoff] },
    { sql: 'DELETE FROM ai_decisions WHERE created_at < ?', args: [cutoff] },
    { sql: 'DELETE FROM events WHERE created_at < ?', args: [cutoff] },
    { sql: "DELETE FROM conversations WHERE updated_at < ? AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id) AND NOT EXISTS (SELECT 1 FROM escalations e WHERE e.conversation_id = conversations.id AND e.status <> 'resolved')", args: [cutoff] },
    { sql: 'DELETE FROM session_tokens WHERE expires_at < ?', args: [nowIso()] },
    { sql: 'DELETE FROM rate_limits WHERE window_start < ?', args: [Date.now() - 86_400_000] },
    auditStatement(actor, 'data.retention_run', 'messages', null, null, { days, cutoff, deleted: messages }),
  ]);
  return { cutoff, deleted: messages };
}
