import { type NextRequest } from 'next/server';
import { errorResponse, json, requireInternalSecret } from '@/lib/api';
import { internalSendReplySchema } from '@/lib/validators';
import { ingest } from '@/lib/ingest';
import { markN8nSeen } from '@/lib/health';

export const maxDuration = 60;

/**
 * Called by the n8n workflow after an automatic reply was approved. Email (deliver=true): this panel sends it over SMTP with threading headers. Chat: n8n already answered the widget; the panel records it.
 * Header: X-Internal-Secret: <INTERNAL_API_SECRET from .env>. Idempotent on requestId.
 */
export async function POST(req: NextRequest) {
  try {
    requireInternalSecret(req);
    const payload = internalSendReplySchema.parse(await req.json().catch(() => ({})));
    const out = await ingest(payload, 'reply');
    await markN8nSeen();
    return json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
