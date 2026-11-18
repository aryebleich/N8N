import { route } from '@/lib/api';
import { destroySession } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

export const POST = route({ role: 'agent' }, async ({ actor }) => {
  await audit(actor, 'auth.logout', 'user', actor.id);
  await destroySession();
  return { ok: true };
});
