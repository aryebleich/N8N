import { z } from 'zod';
import { adminRoute } from '@/lib/api';
import { importAnswers } from '@/lib/faq-admin';
import { SAMPLE_FAQ } from '@/lib/sample-faq';
import { batch } from '@/lib/db';
import { auditStatement } from '@/lib/audit';

/** Wizard step 3: add the 12 sample answers, or remove them. */
export const POST = adminRoute(z.object({ action: z.enum(['add', 'remove']) }), async ({ body, actor }) => {
  if (body.action === 'add') return { ok: true, ...(await importAnswers(SAMPLE_FAQ.map((f) => ({ question: f.question, answer: f.answer, tags: f.keywords, active: true })), actor)) };
  const questions = SAMPLE_FAQ.map((f) => f.question);
  await batch([
    { sql: `DELETE FROM faq WHERE question IN (${questions.map(() => '?').join(',')})`, args: questions },
    auditStatement(actor, 'faq.remove_samples', 'faq', null, null, { removed: questions.length }),
  ]);
  return { ok: true };
});
