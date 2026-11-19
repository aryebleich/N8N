import { adminRoute, HttpError } from '@/lib/api';
import { deleteAnswer, updateAnswer } from '@/lib/faq-admin';
import { answerPatchSchema } from '@/lib/validators';

const idOf = (p: { id: string }) => {
  const id = Number(p.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'That answer does not exist.');
  return id;
};

/** Returns the audit entry id: Undo restores the "before" side of it. */
export const PATCH = adminRoute<typeof answerPatchSchema._output, { id: string }>(answerPatchSchema, async ({ body, params, actor }) => ({ ok: true, auditId: await updateAnswer(idOf(params), body, actor) }));
export const DELETE = adminRoute<undefined, { id: string }>(null, async ({ params, actor }) => { await deleteAnswer(idOf(params), actor); return { ok: true }; });
