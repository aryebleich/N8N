import { route } from '@/lib/api';
import { escalationBulkSchema } from '@/lib/validators';
import { bulkUpdateEscalations } from '@/lib/escalations';

export const runtime = 'nodejs';

export const PATCH = route({ role: 'agent', schema: escalationBulkSchema }, async ({ body, actor }) => {
  const updated = await bulkUpdateEscalations(body, actor);
  return { ok: true, updated };
});
