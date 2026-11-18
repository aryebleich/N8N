import { route } from '@/lib/api';
import { retentionSchema } from '@/lib/validators';
import { applyRetention, retentionPreview } from '@/lib/data';
import { updateSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = route({ role: 'owner', schema: retentionSchema }, async ({ body, actor }) => {
  if (body.mode === 'preview') {
    return { ok: true, preview: body.days ? await retentionPreview(body.days) : null };
  }
  await updateSettings({ retention_days: body.days }, actor);
  if (!body.days) return { ok: true, saved: true, deleted: 0 };
  const result = await applyRetention(body.days, actor);
  return { ok: true, saved: true, ...result };
});
