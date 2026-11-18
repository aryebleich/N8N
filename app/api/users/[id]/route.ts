import { z } from 'zod';
import { route } from '@/lib/api';
import { userUpdateSchema } from '@/lib/validators';
import { updateUser } from '@/lib/users';

export const runtime = 'nodejs';

export const PATCH = route({ role: 'owner', schema: userUpdateSchema }, async ({ body, params, actor }) => {
  const id = z.string().min(3).max(64).parse((params as { id: string }).id);
  return { ok: true, ...(await updateUser(id, body, actor)) };
});
