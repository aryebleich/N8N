import { route } from '@/lib/api';
import { integrationSecretsSchema } from '@/lib/validators';
import { saveSecrets } from '@/lib/secrets';

export const runtime = 'nodejs';

/** Stores API keys encrypted. The response never contains them. */
export const PUT = route({ role: 'owner', schema: integrationSecretsSchema }, async ({ body, actor }) => {
  const saved = await saveSecrets(body.secrets, actor);
  return { ok: true, saved };
});
