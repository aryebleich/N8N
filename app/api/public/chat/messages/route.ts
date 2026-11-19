import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { humanRepliesForWidget } from '@/lib/conversations';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

const query = z.object({
  conversationId: z.string().regex(/^chat:[A-Za-z0-9-]{16,64}$/),
  after: z.coerce.number().int().min(0).default(0),
});

/** Chat widget polling for your replies to a chat. The unguessable conversation id is the only key. */
export async function GET(req: NextRequest) {
  const headers = { ...corsHeaders(req.headers.get('origin')), 'Cache-Control': 'no-store' };
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) return Response.json({ messages: [] }, { status: 400, headers });
  return Response.json({ messages: await humanRepliesForWidget(parsed.data.conversationId, parsed.data.after) }, { headers });
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}
