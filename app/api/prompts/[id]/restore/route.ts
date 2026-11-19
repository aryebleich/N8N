import { adminRoute, HttpError } from '@/lib/api';
import { restorePrompt } from '@/lib/prompts';
import { updateSettings } from '@/lib/settings';
import { promptIdSchema, promptRestoreSchema } from '@/lib/validators';

/** One-click restore of an earlier version (saved as a new version, so nothing is lost). */
export const POST = adminRoute<typeof promptRestoreSchema._output, { id: string }>(promptRestoreSchema, async ({ params, body, actor }) => {
  const id = promptIdSchema.safeParse(params.id);
  if (!id.success) throw new HttpError(404, 'That text does not exist.');
  const r = await restorePrompt(id.data, body.version, actor);
  if (id.data === 'claude_system') await updateSettings({ prompt_mode: 'custom' }, actor);
  return { ok: true, ...r };
});
