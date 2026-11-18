import { route } from '@/lib/api';
import { integrationTestSchema } from '@/lib/validators';
import { testService } from '@/lib/health';
import { audit } from '@/lib/audit';
import { LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const POST = route({ role: 'owner', schema: integrationTestSchema, rate: { name: 'integration-test', ...LIMITS.integrationTest } }, async ({ body, actor }) => {
  const result = await testService(body.service);
  await audit(actor, 'integration.test', 'integration', body.service, null, { ok: result.ok, latencyMs: result.latencyMs });
  return { ok: true, result };
});
