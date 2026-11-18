import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { humanRepliesForWidget } from '@/lib/conversations';
import { corsHeaders } from '@/lib/cors';
import { clientIp } from '@/lib/auth';
import { rateLimit, LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const query = z.object({
  conversationId: z.string().regex(/^chat:[A-Za-z0-9-]{16,64}$/),
  after: z.coerce.number().int().min(0).default(0),
});

/** Chat widget polling: teammates' replies to an escalated chat. The unguessable conversation id is the capability. */
export async function GET(req: NextRequest) {
  const headers = { ...corsHeaders(req.headers.get('origin')), 'Cache-Control': 'no-store' };
  const ip = await clientIp();
  const rl = await rateLimit(`poll:ip:${ip}`, LIMITS.publicPoll.limit, LIMITS.publicPoll.windowMs);
  if (!rl.ok) return Response.json({ error: 'Too many requests' }, { status: 429, headers });
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) return Response.json({ messages: [] }, { status: 400, headers });
  const messages = await humanRepliesForWidget(parsed.data.conversationId, parsed.data.after);
  return Response.json({ messages }, { headers });
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}
