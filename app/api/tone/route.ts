import { adminRoute } from '@/lib/api';
import { saveTone } from '@/lib/tone-admin';
import { toneSchema } from '@/lib/validators';

/** Saves the Tone and Rules page. Returns a snapshot of how it was before, for Undo. */
export const PUT = adminRoute(toneSchema, async ({ body, actor }) => ({ ok: true, before: await saveTone(body, actor) }));
