import { type NextRequest } from 'next/server';
import { errorResponse, json, requireInternalSecret } from '@/lib/api';
import { internalEscalateSchema } from '@/lib/validators';
import { ingest } from '@/lib/ingest';
import { markN8nSeen } from '@/lib/health';

export const maxDuration = 60;

/**
 * Called by the n8n workflow when a person must help. Stores the escalation, sends the holding email (deliver=true) and posts the Slack alert.
 * Header: X-Internal-Secret: <INTERNAL_API_SECRET from .env>. Idempotent on requestId.
 */
export async function POST(req: NextRequest) {
  try {
    requireInternalSecret(req);
    const payload = internalEscalateSchema.parse(await req.json().catch(() => ({})));
    const out = await ingest(payload, 'escalate');
    await markN8nSeen();
    return json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
