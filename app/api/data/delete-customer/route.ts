import { route } from '@/lib/api';
import { deleteCustomerSchema } from '@/lib/validators';
import { deleteCustomerData } from '@/lib/data';

export const runtime = 'nodejs';

/** Deletes conversations, messages, decisions, notes, escalations and session tokens in Turso. Oracle is never modified. */
export const POST = route({ role: 'owner', schema: deleteCustomerSchema }, async ({ body, actor }) => {
  return { ok: true, deleted: await deleteCustomerData(body.email, actor) };
});
