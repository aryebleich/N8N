import { adminRoute, HttpError } from '@/lib/api';
import { getPrompt, listVersions, savePrompt } from '@/lib/prompts';
import { updateSettings } from '@/lib/settings';
import { promptIdSchema, promptSaveSchema } from '@/lib/validators';

const idOf = (p: { id: string }) => {
  const r = promptIdSchema.safeParse(p.id);
  if (!r.success) throw new HttpError(404, 'That text does not exist.');
  return r.data;
};

export const dynamic = 'force-dynamic';

export const GET = adminRoute<undefined, { id: string }>(null, async ({ params }) => {
  const id = idOf(params);
  return { prompt: await getPrompt(id), versions: await listVersions(id) };
});

/** Advanced: save your own raw instructions. Editing the Claude instructions switches them to "custom". */
export const PUT = adminRoute<typeof promptSaveSchema._output, { id: string }>(promptSaveSchema, async ({ params, body, actor }) => {
  const id = idOf(params);
  const r = await savePrompt(id, body.body, 'Edited by hand', actor);
  if (id === 'claude_system' && !r.unchanged) await updateSettings({ prompt_mode: 'custom' }, actor);
  return { ok: true, ...r };
});
