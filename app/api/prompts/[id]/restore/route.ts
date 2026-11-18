import { route } from '@/lib/api';
import { promptIdSchema, promptRestoreSchema } from '@/lib/validators';
import { restorePrompt } from '@/lib/prompts';

export const runtime = 'nodejs';

export const POST = route({ role: 'owner', schema: promptRestoreSchema }, async ({ body, params, actor }) => {
  const id = promptIdSchema.parse((params as { id: string }).id);
  return { ok: true, ...(await restorePrompt(id, body.version, actor)) };
});
