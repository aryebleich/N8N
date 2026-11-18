import 'server-only';
import { all } from './db';

export interface FaqRow {
  id: number;
  question: string;
  answer: string;
  tags: string;
  active: number;
  updated_at: string;
}

const STOP = new Set(
  ('a about above after again all am an and any are as at be because been before being below between both but by can cannot could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours out over own please same she should so some such than thank thanks that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours hello hi hey dear regards best kind team support help need want know get got im ive dont cant wont').split(' '),
);

/** Same keyword extraction as the n8n "Turso: Build Load Context" node. */
export function extractKeywords(text: string): string[] {
  const words = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w))
    .map((w) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return [...new Set(words)].slice(0, 8);
}

/** FTS5 first, LIKE fallback, exactly like the workflow. */
export async function retrieveFaq(text: string, limit = 5): Promise<{ rows: FaqRow[]; method: 'fts5' | 'like' | 'none'; keywords: string[] }> {
  const keywords = extractKeywords(text);
  if (!keywords.length) return { rows: [], method: 'none', keywords };
  try {
    const rows = await all<FaqRow>(
      'SELECT f.id, f.question, f.answer, f.tags, f.active, f.updated_at FROM faq_fts JOIN faq f ON f.id = faq_fts.rowid WHERE faq_fts MATCH ? AND f.active = 1 ORDER BY bm25(faq_fts) LIMIT ?',
      [keywords.map((k) => `"${k.replace(/"/g, '')}"*`).join(' OR '), limit],
    );
    if (rows.length) return { rows, method: 'fts5', keywords };
  } catch {
    /* FTS table missing: fall back */
  }
  const score = keywords.map(() => '(CASE WHEN lower(tags) LIKE ? THEN 3 ELSE 0 END) + (CASE WHEN lower(question) LIKE ? THEN 2 ELSE 0 END)').join(' + ');
  const rows = await all<FaqRow>(
    `SELECT id, question, answer, tags, active, updated_at FROM (SELECT *, (${score}) AS score FROM faq WHERE active = 1) WHERE score > 0 ORDER BY score DESC, id ASC LIMIT ?`,
    [...keywords.flatMap((k) => [`%${k}%`, `%${k}%`]), limit],
  );
  return { rows, method: rows.length ? 'like' : 'none', keywords };
}

export function formatFaqContext(rows: Pick<FaqRow, 'id' | 'question' | 'answer' | 'tags'>[]): string {
  return rows.length
    ? rows.map((f) => `[FAQ #${f.id}] Q: ${f.question}\nA: ${f.answer}\n(tags: ${f.tags || ''})`).join('\n\n')
    : '(No matching FAQ entries were found for this message.)';
}
