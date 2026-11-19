import { parseCsv } from './csv';

export interface ImportRow { line: number; question: string; answer: string; tags: string; active: boolean; problem: string | null }

const normTags = (t: string) => [...new Set(t.split(/[,;|]/).map((x) => x.trim().toLowerCase()).filter(Boolean))].join(',');
const OFF = ['0', 'false', 'no', 'off', 'n'];

/**
 * Reads a spreadsheet saved as CSV. First row must name the columns:
 * question, reply (or answer), keywords (or tags, optional), use_this_answer (optional: yes/no).
 * Every row is returned with a plain-language problem, or null when it can be imported.
 */
export function parseAnswersCsv(text: string): { rows: ImportRow[]; error: string | null } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], error: 'The file is empty.' };
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const qi = col('question');
  const ai = col('reply', 'answer');
  const ki = col('keywords', 'tags');
  const ui = col('use_this_answer', 'active', 'use');
  if (qi < 0 || ai < 0) return { rows: [], error: 'The first row needs the column names "question" and "reply". Download the template to see the layout.' };
  const seen = new Set<string>();
  const rows = table.slice(1).map((r, i) => {
    const question = (r[qi] || '').trim();
    const answer = (r[ai] || '').trim();
    let problem: string | null = null;
    if (question.length < 3) problem = 'The question is missing or too short.';
    else if (answer.length < 3) problem = 'The reply is missing or too short.';
    else if (question.length > 500 || answer.length > 5000) problem = 'The question (500) or reply (5,000 characters) is too long.';
    else if (seen.has(question.toLowerCase())) problem = 'This question appears twice in the file.';
    seen.add(question.toLowerCase());
    return { line: i + 2, question, answer, tags: ki >= 0 ? normTags(r[ki] || '') : '', active: ui >= 0 ? !OFF.includes((r[ui] || '').trim().toLowerCase()) : true, problem };
  });
  if (rows.length > 2000) return { rows: [], error: 'Import at most 2,000 answers at a time.' };
  return { rows, error: rows.length ? null : 'The file has column names but no answers.' };
}
