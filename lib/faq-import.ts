import { parseCsv } from './csv';

export interface FaqDraft {
  question: string;
  answer: string;
  tags: string;
  active: boolean;
}

export interface ImportResult {
  entries: FaqDraft[];
  errors: string[];
}

const normTags = (t: string) => [...new Set(t.split(/[,;|]/).map((x) => x.trim().toLowerCase()).filter(Boolean))].join(',');

/** CSV with a header row: question, answer, tags (optional), active (optional: 1/0, true/false, yes/no). */
export function parseFaqCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (!rows.length) return { entries: [], errors: ['The file is empty.'] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const qi = header.indexOf('question');
  const ai = header.indexOf('answer');
  const ti = header.indexOf('tags');
  const act = header.indexOf('active');
  if (qi < 0 || ai < 0) return { entries: [], errors: ['The first row must contain "question" and "answer" column headers.'] };
  const entries: FaqDraft[] = [];
  rows.slice(1).forEach((r, i) => {
    const question = (r[qi] || '').trim();
    const answer = (r[ai] || '').trim();
    if (question.length < 3 || answer.length < 3) { errors.push(`Row ${i + 2}: question and answer need at least 3 characters.`); return; }
    if (question.length > 500 || answer.length > 5000) { errors.push(`Row ${i + 2}: question (500) or answer (5000) is too long.`); return; }
    const a = act >= 0 ? (r[act] || '').trim().toLowerCase() : '';
    entries.push({ question, answer, tags: ti >= 0 ? normTags(r[ti] || '') : '', active: !['0', 'false', 'no', 'inactive'].includes(a) });
  });
  return { entries, errors };
}

/**
 * Markdown: each "## Question" or "### Question" heading starts an entry; the text below is the answer.
 * An optional "Tags: a, b" line sets tags. Leading numbering ("### 3. ...") is removed, so
 * n8n/docs/sample-faq.md imports as is.
 */
export function parseFaqMarkdown(text: string): ImportResult {
  const entries: FaqDraft[] = [];
  const errors: string[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let current: { question: string; body: string[]; tags: string } | null = null;
  const flush = () => {
    if (!current) return;
    const answer = current.body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (current.question.length >= 3 && answer.length >= 3) entries.push({ question: current.question.slice(0, 500), answer: answer.slice(0, 5000), tags: current.tags, active: true });
    else errors.push(`"${current.question.slice(0, 60)}": missing answer text.`);
    current = null;
  };
  for (const line of lines) {
    const h = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (h) {
      flush();
      current = { question: h[1].replace(/^\d+[.)]\s*/, '').trim(), body: [], tags: '' };
      continue;
    }
    if (!current) continue;
    const t = line.match(/^\s*(?:\*\*)?tags(?:\*\*)?\s*:\s*(.+)$/i);
    if (t) { current.tags = normTags(t[1].replace(/\*\*/g, '')); continue; }
    if (/^---+\s*$/.test(line) || /^\|/.test(line)) continue;
    current.body.push(line);
  }
  flush();
  if (!entries.length && !errors.length) errors.push('No "## Question" or "### Question" headings were found.');
  return { entries, errors };
}
