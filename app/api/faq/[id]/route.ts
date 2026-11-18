import { z } from 'zod';
import { route } from '@/lib/api';
import { faqPatchSchema } from '@/lib/validators';
import { deleteFaq, updateFaq } from '@/lib/faq-admin';

export const runtime = 'nodejs';

const idOf = (p: unknown) => z.coerce.number().int().positive().parse((p as { id: string }).id);

export const PATCH = route({ role: 'owner', schema: faqPatchSchema }, async ({ body, params, actor }) => {
  await updateFaq(idOf(params), body, actor);
  return { ok: true };
});

export const DELETE = route({ role: 'owner' }, async ({ params, actor }) => {
  await deleteFaq(idOf(params), actor);
  return { ok: true };
});
