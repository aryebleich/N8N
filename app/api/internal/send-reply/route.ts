import { type NextRequest } from 'next/server';
import { json, errorResponse, requireInternalSecret } from '@/lib/api';
import { internalSendReplySchema } from '@/lib/validators';
import { ingest } from '@/lib/ingest';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Called by the n8n workflow after an automatic reply was approved.
 * Header: X-Internal-Secret: <INTERNAL_API_SECRET>
 * Email (deliver=true): the site sends the reply over SMTP with threading headers.
 * Chat (deliver=false): n8n already answered the widget; the site records it.
 */
export async function POST(req: NextRequest) {
  try {
    requireInternalSecret(req);
    const payload = internalSendReplySchema.parse(await req.json().catch(() => ({})));
    return json(await ingest(payload, 'reply'));
  } catch (e) {
    return errorResponse(e);
  }
}
