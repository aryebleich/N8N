import { adminRoute } from '@/lib/api';
import { getSettings, updateSettings } from '@/lib/settings';
import { settingsUpdateSchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(null, async () => ({ settings: await getSettings(true) }));

/** Saves only the settings that were sent. Returns the old values so the page can offer Undo. */
export const PATCH = adminRoute(settingsUpdateSchema, async ({ body, actor }) => {
  const before = await getSettings(true);
  const changed = await updateSettings(body, actor);
  return { ok: true, changed, previous: Object.fromEntries(changed.map((k) => [k, before[k]])), settings: await getSettings(true) };
});
