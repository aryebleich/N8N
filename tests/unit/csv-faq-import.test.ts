import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { csvCell, parseCsv, toCsv } from '@/lib/csv';
import { parseFaqCsv, parseFaqMarkdown } from '@/lib/faq-import';

describe('CSV', () => {
  it('parses quotes, commas, newlines and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","line1\nline2"\r\n"q""uote",z')).toEqual([['a', 'b'], ['x, y', 'line1\nline2'], ['q"uote', 'z']]);
  });
  it('neutralises spreadsheet formulas when writing', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(toCsv(['a'], [[1], [null]])).toBe('"a"\r\n"1"\r\n""\r\n');
  });
});

describe('FAQ import', () => {
  it('reads CSV with optional tags and active columns', () => {
    const r = parseFaqCsv('question,answer,tags,active\n"How long is shipping?","3 to 5 days.","Shipping; Delivery",1\n"Old?","Retired answer.","",0\n"x","",,');
    expect(r.entries).toEqual([
      { question: 'How long is shipping?', answer: '3 to 5 days.', tags: 'shipping,delivery', active: true },
      { question: 'Old?', answer: 'Retired answer.', tags: '', active: false },
    ]);
    expect(r.errors).toHaveLength(1);
  });
  it('requires the header row', () => {
    expect(parseFaqCsv('foo,bar\n1,2').errors[0]).toMatch(/header/);
  });
  it('reads Markdown headings, answers and Tags lines', () => {
    const r = parseFaqMarkdown('# Title\n\n## Do you ship abroad?\nYes, to the EU.\n\nTags: international, shipping\n\n### 2. Returns?\nWithin 30 days.\n');
    expect(r.entries).toEqual([
      { question: 'Do you ship abroad?', answer: 'Yes, to the EU.', tags: 'international,shipping', active: true },
      { question: 'Returns?', answer: 'Within 30 days.', tags: '', active: true },
    ]);
  });
  it('imports the repository sample FAQ unchanged', () => {
    const md = readFileSync(path.join(__dirname, '../../n8n/docs/sample-faq.md'), 'utf8');
    const r = parseFaqMarkdown(md);
    expect(r.entries.length).toBe(12);
    expect(r.entries[0].question).toBe('How long does shipping take?');
  });
});
