import { route } from '@/lib/api';
import { userInviteSchema } from '@/lib/validators';
import { inviteUser } from '@/lib/users';

export const runtime = 'nodejs';

export const POST = route({ role: 'owner', schema: userInviteSchema }, async ({ body, actor }) => {
  return { ok: true, ...(await inviteUser(body.email, body.name, body.role, actor)) };
});
