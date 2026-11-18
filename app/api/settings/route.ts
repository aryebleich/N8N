import { route } from '@/lib/api';
import { settingsUpdateSchema } from '@/lib/validators';
import { updateSettings } from '@/lib/settings';

export const runtime = 'nodejs';

export const PUT = route({ role: 'owner', schema: settingsUpdateSchema }, async ({ body, actor }) => {
  const changed = await updateSettings(body, actor);
  return { ok: true, changed };
});
