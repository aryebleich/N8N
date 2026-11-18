import 'server-only';
import { all, batch, get, nowIso } from './db';
import { auditStatement, type Actor } from './audit';
import { eventStatement } from './events';
import { ApiError } from './api';
import { maskEmail, safeCustomerText } from './mask';

export interface EscalationItem {
  id: number;
  conversationId: string | null;
  channel: string | null;
  status: string;
  priority: string;
  reasonCode: string | null;
  reason: string;
  assigneeId: string | null;
  assignee: string | null;
  customer: string;
  claudeConfidence: number | null;
  geminiConfidence: number | null;
  slaDueAt: string | null;
  slackTs: string | null;
  createdAt: string;
}

export interface EscalationFilter {
  status?: string;
  priority?: string;
  reason?: string;
  assignee?: string;
}

export async function listEscalations(f: EscalationFilter, limit = 200): Promise<EscalationItem[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.status) { where.push('e.status = ?'); args.push(f.status); }
  else { where.push("e.status IN ('open', 'in_progress')"); }
  if (f.priority) { where.push('e.priority = ?'); args.push(f.priority); }
  if (f.reason) { where.push('e.reason_code = ?'); args.push(f.reason); }
  if (f.assignee === 'none') where.push('e.assignee_id IS NULL');
  else if (f.assignee) { where.push('e.assignee_id = ?'); args.push(f.assignee); }
  const rows = await all<Record<string, unknown>>(
    `SELECT e.*, c.customer_email, COALESCE(u.name, u.email) AS assignee
       FROM escalations e
       LEFT JOIN conversations c ON c.id = e.conversation_id
       LEFT JOIN users u ON u.id = e.assignee_id
      WHERE ${where.join(' AND ')}
      ORDER BY CASE e.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, COALESCE(e.sla_due_at, e.created_at) ASC
      LIMIT ?`,
    [...args, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    conversationId: (r.conversation_id as string) || null,
    channel: (r.channel as string) || null,
    status: String(r.status || 'open'),
    priority: String(r.priority || 'normal'),
    reasonCode: (r.reason_code as string) || null,
    reason: safeCustomerText(String(r.reason || '')).slice(0, 400),
    assigneeId: (r.assignee_id as string) || null,
    assignee: (r.assignee as string) || null,
    customer: maskEmail(r.customer_email as string) || '—',
    claudeConfidence: r.claude_confidence == null ? null : Number(r.claude_confidence),
    geminiConfidence: r.gemini_confidence == null ? null : Number(r.gemini_confidence),
    slaDueAt: (r.sla_due_at as string) || null,
    slackTs: (r.slack_ts as string) || null,
    createdAt: String(r.created_at),
  }));
}

type Bulk =
  | { action: 'resolve'; ids: number[] }
  | { action: 'assign'; ids: number[]; assigneeId: string | null }
  | { action: 'status'; ids: number[]; status: 'open' | 'in_progress' | 'resolved' }
  | { action: 'priority'; ids: number[]; priority: 'high' | 'normal' | 'low' };

export async function bulkUpdateEscalations(input: Bulk, actor: Actor): Promise<number> {
  const placeholders = input.ids.map(() => '?').join(',');
  const before = await all<Record<string, unknown>>(`SELECT id, conversation_id, status, priority, assignee_id FROM escalations WHERE id IN (${placeholders})`, input.ids);
  if (!before.length) throw new ApiError(404, 'None of the selected escalations exist.');
  if (input.action === 'assign' && input.assigneeId) {
    const u = await get('SELECT id FROM users WHERE id = ? AND active = 1', [input.assigneeId]);
    if (!u) throw new ApiError(400, 'That teammate does not exist or is deactivated.');
  }
  const now = nowIso();
  const statements = [];
  for (const row of before) {
    let sql = '';
    let args: (string | number | null)[] = [];
    let next: Record<string, unknown> = {};
    if (input.action === 'resolve' || (input.action === 'status' && input.status === 'resolved')) {
      sql = "UPDATE escalations SET status = 'resolved', resolved_at = ?, resolved_by = ?, updated_at = ? WHERE id = ?";
      args = [now, actor.id, now, Number(row.id)];
      next = { status: 'resolved' };
    } else if (input.action === 'status') {
      sql = 'UPDATE escalations SET status = ?, resolved_at = NULL, resolved_by = NULL, updated_at = ? WHERE id = ?';
      args = [input.status, now, Number(row.id)];
      next = { status: input.status };
    } else if (input.action === 'assign') {
      sql = "UPDATE escalations SET assignee_id = ?, status = CASE WHEN status = 'open' AND ? IS NOT NULL THEN 'in_progress' ELSE status END, updated_at = ? WHERE id = ?";
      args = [input.assigneeId, input.assigneeId, now, Number(row.id)];
      next = { assignee_id: input.assigneeId };
    } else {
      sql = 'UPDATE escalations SET priority = ?, updated_at = ? WHERE id = ?';
      args = [input.priority, now, Number(row.id)];
      next = { priority: input.priority };
    }
    statements.push({ sql, args });
    statements.push(auditStatement(actor, `escalation.${input.action}`, 'escalation', Number(row.id), { status: row.status, priority: row.priority, assignee_id: row.assignee_id }, next));
    statements.push(eventStatement('escalation.updated', (row.conversation_id as string) || null, { id: Number(row.id), ...next }));
  }
  await batch(statements);
  return before.length;
}

export { REASON_LABELS } from './reason-labels';
