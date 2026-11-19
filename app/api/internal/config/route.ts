import { type NextRequest } from 'next/server';
import { errorResponse, json, requireInternalSecret } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import { getPromptBodies } from '@/lib/prompts';
import { all } from '@/lib/db';
import { markN8nSeen } from '@/lib/health';

export const dynamic = 'force-dynamic';

/**
 * For n8n (header X-Internal-Secret). Everything the workflow needs in one call:
 * settings, tone/instructions and active answers. n8n caches it for 30 seconds.
 * (The bundled workflow reads the same rows straight from Turso; this endpoint is for
 * setups where n8n should not hold database credentials.)
 */
export async function GET(req: NextRequest) {
  try {
    requireInternalSecret(req);
    const [settings, prompts, faq] = await Promise.all([
      getSettings(true),
      getPromptBodies(),
      all('SELECT id, question, answer, tags, updated_at FROM faq WHERE active = 1 ORDER BY id'),
    ]);
    await markN8nSeen();
    return json({ settings, prompts, faq, cacheSeconds: 30, generatedAt: new Date().toISOString() });
  } catch (e) {
    return errorResponse(e);
  }
}
