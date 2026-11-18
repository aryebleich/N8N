import 'server-only';
import { all, batch, get, nowIso, rowsOf } from './db';
import { auditStatement, type Actor } from './audit';
import { ApiError } from './api';
import type { FaqRow } from './faq';
import type { FaqDraft } from './faq-import';

export async function listFaq(q?: string, tag?: string): Promise<FaqRow[]> {
  const where: string[] = [];
  const args: string[] = [];
  if (q) { where.push('(lower(question) LIKE ? OR lower(answer) LIKE ? OR lower(tags) LIKE ?)'); const l = `%${q.toLowerCase()}%`; args.push(l, l, l); }
  if (tag) { where.push("(',' || lower(tags) || ',') LIKE ?"); args.push(`%,${tag.toLowerCase()},%`); }
  return all<FaqRow>(`SELECT id, question, answer, tags, active, updated_at FROM faq ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY active DESC, updated_at DESC LIMIT 1000`, args);
}

export async function allTags(): Promise<string[]> {
  const rows = await all<{ tags: string }>('SELECT tags FROM faq');
  return [...new Set(rows.flatMap((r) => r.tags.split(',').map((t) => t.trim()).filter(Boolean)))].sort();
}

const getFaq = (id: number) => get<FaqRow>('SELECT id, question, answer, tags, active, updated_at FROM faq WHERE id = ?', [id]);

export async function createFaq(input: FaqDraft, actor: Actor) {
  const res = await batch([
    { sql: 'INSERT INTO faq (question, answer, tags, active, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id', args: [input.question, input.answer, input.tags, input.active ? 1 : 0, nowIso()] },
  ]);
  const id = Number(rowsOf<{ id: number }>(res[0])[0].id);
  await batch([auditStatement(actor, 'faq.create', 'faq', id, null, input)]);
  return id;
}

export async function duplicateFaq(sourceId: number, actor: Actor) {
  const src = await getFaq(sourceId);
  if (!src) throw new ApiError(404, 'FAQ entry not found.');
  return createFaq({ question: `${src.question} (copy)`.slice(0, 500), answer: src.answer, tags: src.tags, active: false }, actor);
}

export async function updateFaq(id: number, patch: Partial<FaqDraft>, actor: Actor) {
  const before = await getFaq(id);
  if (!before) throw new ApiError(404, 'FAQ entry not found.');
  const next = {
    question: patch.question ?? before.question,
    answer: patch.answer ?? before.answer,
    tags: patch.tags ?? before.tags,
    active: patch.active ?? before.active === 1,
  };
  await batch([
    { sql: 'UPDATE faq SET question = ?, answer = ?, tags = ?, active = ?, updated_at = ? WHERE id = ?', args: [next.question, next.answer, next.tags, next.active ? 1 : 0, nowIso(), id] },
    auditStatement(actor, 'faq.update', 'faq', id, { question: before.question, answer: before.answer, tags: before.tags, active: before.active === 1 }, next),
  ]);
}

export async function deleteFaq(id: number, actor: Actor) {
  const before = await getFaq(id);
  if (!before) throw new ApiError(404, 'FAQ entry not found.');
  await batch([{ sql: 'DELETE FROM faq WHERE id = ?', args: [id] }, auditStatement(actor, 'faq.delete', 'faq', id, before, null)]);
}

export async function importFaq(entries: FaqDraft[], skipDuplicates: boolean, actor: Actor) {
  const existing = new Set((await all<{ q: string }>('SELECT lower(trim(question)) AS q FROM faq')).map((r) => r.q));
  const now = nowIso();
  const toInsert = entries.filter((e) => !skipDuplicates || !existing.has(e.question.trim().toLowerCase()));
  if (toInsert.length) {
    await batch([
      ...toInsert.map((e) => ({ sql: 'INSERT INTO faq (question, answer, tags, active, updated_at) VALUES (?, ?, ?, ?, ?)', args: [e.question, e.answer, e.tags, e.active ? 1 : 0, now] })),
      auditStatement(actor, 'faq.import', 'faq', null, null, { imported: toInsert.length, skipped: entries.length - toInsert.length }),
    ]);
  }
  return { imported: toInsert.length, skipped: entries.length - toInsert.length };
}
