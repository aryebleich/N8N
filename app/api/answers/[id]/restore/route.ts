import { adminRoute } from '@/lib/api';
import { restoreAnswer } from '@/lib/faq-admin';
import { answerRestoreSchema } from '@/lib/validators';

export const POST = adminRoute<typeof answerRestoreSchema._output, { id: string }>(answerRestoreSchema, async ({ body, params, actor }) => {
  await restoreAnswer(Number(params.id), body.auditId, body.which, actor);
  return { ok: true };
});
