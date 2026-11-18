import { route, ApiError } from '@/lib/api';
import { faqImportSchema } from '@/lib/validators';
import { parseFaqCsv, parseFaqMarkdown } from '@/lib/faq-import';
import { importFaq } from '@/lib/faq-admin';

export const runtime = 'nodejs';

export const POST = route({ role: 'owner', schema: faqImportSchema }, async ({ body, actor }) => {
  const parsed = body.format === 'csv' ? parseFaqCsv(body.content) : parseFaqMarkdown(body.content);
  if (!parsed.entries.length) throw new ApiError(400, 'No valid entries found.', parsed.errors);
  if (parsed.entries.length > 2000) throw new ApiError(400, 'Import at most 2000 entries at a time.');
  const result = await importFaq(parsed.entries, body.skipDuplicates, actor);
  return { ok: true, ...result, warnings: parsed.errors };
});
