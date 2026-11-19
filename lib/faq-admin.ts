import 'server-only';
import { all, batch, get, nowIso, rowsOf } from './db';
import { auditStatement, type Actor } from './audit';
import { HttpError } from './errors';

export interface Answer { id: number; question: string; answer: string; tags: string; active: number; updated_at: string }
export interface AnswerInput { question: string; answer: string; tags: string; active: boolean }

export const listAnswers = () => all<Answer>('SELECT id, question, answer, tags, active, updated_at FROM faq ORDER BY active DESC, updated_at DESC LIMIT 2000');
const getAnswer = (id: number) => get<Answer>('SELECT id, question, answer, tags, active, updated_at FROM faq WHERE id = ?', [id]);
const snapshot = (a: Answer) => ({ question: a.question, answer: a.answer, tags: a.tags, active: a.active === 1 });

export async function createAnswer(input: AnswerInput, actor: Actor) {
  const res = await batch([{ sql: 'INSERT INTO faq (question, answer, tags, active, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id', args: [input.question, input.answer, input.tags, input.active ? 1 : 0, nowIso()] }]);
  const id = Number(rowsOf<{ id: number }>(res[0])[0].id);
  await batch([auditStatement(actor, 'faq.create', 'faq', id, null, input)]);
  return id;
}

/** Updates an answer and returns the audit entry id, which Undo uses to restore the old text. */
export async function updateAnswer(id: number, patch: Partial<AnswerInput>, actor: Actor) {
  const before = await getAnswer(id);
  if (!before) throw new HttpError(404, 'That answer no longer exists.');
  const next = { question: patch.question ?? before.question, answer: patch.answer ?? before.answer, tags: patch.tags ?? before.tags, active: patch.active ?? before.active === 1 };
  const audited = auditStatement(actor, 'faq.update', 'faq', id, snapshot(before), next) as { sql: string; args: (string | null)[] };
  const res = await batch([
    { sql: 'UPDATE faq SET question = ?, answer = ?, tags = ?, active = ?, updated_at = ? WHERE id = ?', args: [next.question, next.answer, next.tags, next.active ? 1 : 0, nowIso(), id] },
    { sql: `${audited.sql} RETURNING id`, args: audited.args },
  ]);
  return Number(rowsOf<{ id: number }>(res[1])[0].id);
}

export async function deleteAnswer(id: number, actor: Actor) {
  const before = await getAnswer(id);
  if (!before) throw new HttpError(404, 'That answer no longer exists.');
  await batch([{ sql: 'DELETE FROM faq WHERE id = ?', args: [id] }, auditStatement(actor, 'faq.delete', 'faq', id, snapshot(before), null)]);
}

export interface AnswerHistoryEntry { auditId: number; action: string; at: string; before: AnswerInput | null; after: AnswerInput | null }

/** Full history of one answer, newest first, from the append-only audit log. */
export async function answerHistory(id: number): Promise<AnswerHistoryEntry[]> {
  const rows = await all<{ id: number; action: string; created_at: string; old_json: string | null; new_json: string | null }>(
    "SELECT id, action, created_at, old_json, new_json FROM audit_log WHERE entity = 'faq' AND entity_id = ? ORDER BY id DESC LIMIT 100",
    [String(id)],
  );
  const parse = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
  return rows.map((r) => ({ auditId: Number(r.id), action: r.action, at: r.created_at, before: parse(r.old_json), after: parse(r.new_json) }));
}

/** Puts an answer back to how it was before (Undo) or after (Restore) a recorded change. */
export async function restoreAnswer(id: number, auditId: number, which: 'before' | 'after', actor: Actor) {
  const entry = (await answerHistory(id)).find((h) => h.auditId === auditId);
  const target = entry?.[which];
  if (!target) throw new HttpError(400, 'That earlier version cannot be restored.');
  const exists = await getAnswer(id);
  if (!exists) {
    await batch([
      { sql: 'INSERT INTO faq (id, question, answer, tags, active, updated_at) VALUES (?, ?, ?, ?, ?, ?)', args: [id, target.question, target.answer, target.tags, target.active ? 1 : 0, nowIso()] },
      auditStatement(actor, 'faq.restore', 'faq', id, null, target),
    ]);
    return;
  }
  await batch([
    { sql: 'UPDATE faq SET question = ?, answer = ?, tags = ?, active = ?, updated_at = ? WHERE id = ?', args: [target.question, target.answer, target.tags, target.active ? 1 : 0, nowIso(), id] },
    auditStatement(actor, 'faq.restore', 'faq', id, snapshot(exists), target),
  ]);
}

export async function importAnswers(entries: AnswerInput[], actor: Actor) {
  const existing = new Set((await all<{ q: string }>('SELECT lower(trim(question)) AS q FROM faq')).map((r) => r.q));
  const fresh = entries.filter((e) => !existing.has(e.question.trim().toLowerCase()));
  if (fresh.length) {
    const now = nowIso();
    await batch([
      ...fresh.map((e) => ({ sql: 'INSERT INTO faq (question, answer, tags, active, updated_at) VALUES (?, ?, ?, ?, ?)', args: [e.question, e.answer, e.tags, e.active ? 1 : 0, now] })),
      auditStatement(actor, 'faq.import', 'faq', null, null, { added: fresh.length, skipped: entries.length - fresh.length }),
    ]);
  }
  return { added: fresh.length, skipped: entries.length - fresh.length };
}
