import { adminRoute } from '@/lib/api';
import { resetToRecommended } from '@/lib/tone-admin';

export const POST = adminRoute(null, async ({ actor }) => ({ ok: true, before: await resetToRecommended(actor) }));
