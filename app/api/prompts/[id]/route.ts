import { route } from '@/lib/api';
import { promptIdSchema, promptSaveSchema } from '@/lib/validators';
import { savePrompt } from '@/lib/prompts';

export const runtime = 'nodejs';

export const PUT = route({ role: 'owner', schema: promptSaveSchema }, async ({ body, params, actor }) => {
  const id = promptIdSchema.parse((params as { id: string }).id);
  return { ok: true, ...(await savePrompt(id, body.body, body.note, body.expectedVersion, actor)) };
});
