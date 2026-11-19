import { buildSampleCsv } from '@/lib/seed-source';

/** The spreadsheet template (the same file as docs/sample-faq.csv). */
export function GET() {
  return new Response(buildSampleCsv(), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="answers-template.csv"', 'Cache-Control': 'no-store' },
  });
}
