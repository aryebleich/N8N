import { adminRoute, HttpError } from '@/lib/api';
import { parseAnswersCsv } from '@/lib/faq-import';
import { importAnswers } from '@/lib/faq-admin';
import { importSchema } from '@/lib/validators';

/** mode "preview": shows what would be imported. mode "import": adds the good rows, skips questions you already have. */
export const POST = adminRoute(importSchema, async ({ body, actor }) => {
  const { rows, error } = parseAnswersCsv(body.content);
  if (error) throw new HttpError(400, error);
  const good = rows.filter((r) => !r.problem);
  if (body.mode === 'preview') return { rows, good: good.length, bad: rows.length - good.length };
  if (!good.length) throw new HttpError(400, 'None of the rows can be imported. Fix the problems shown in the preview.');
  return { ok: true, ...(await importAnswers(good, actor)) };
});
