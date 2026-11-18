import { type NextRequest } from 'next/server';
import { json, errorResponse, requireInternalSecret } from '@/lib/api';
import { internalEscalateSchema } from '@/lib/validators';
import { ingest } from '@/lib/ingest';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Called by the n8n workflow when a conversation goes to a human.
 * Header: X-Internal-Secret: <INTERNAL_API_SECRET>
 * Records the conversation, sends the holding email (email + deliver=true), creates the
 * escalation with reason code, priority and SLA, and posts the masked Slack alert.
 */
export async function POST(req: NextRequest) {
  try {
    requireInternalSecret(req);
    const payload = internalEscalateSchema.parse(await req.json().catch(() => ({})));
    return json(await ingest(payload, 'escalate'));
  } catch (e) {
    return errorResponse(e);
  }
}
