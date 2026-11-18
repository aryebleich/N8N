import { route } from '@/lib/api';
import { faqCreateSchema } from '@/lib/validators';
import { createFaq, duplicateFaq } from '@/lib/faq-admin';

export const runtime = 'nodejs';

export const POST = route({ role: 'owner', schema: faqCreateSchema }, async ({ body, actor }) => {
  const id = 'duplicateOf' in body ? await duplicateFaq(body.duplicateOf, actor) : await createFaq(body, actor);
  return { ok: true, id };
});
