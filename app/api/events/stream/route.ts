import { type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { eventsAfter, latestEventId } from '@/lib/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Server-Sent Events. Polls the `events` table every 2 s and streams new rows. Closes
 * after ~50 s (serverless-friendly); the browser's EventSource reconnects with
 * Last-Event-ID, so no event is missed.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const header = Number(req.headers.get('last-event-id') || '');
  let lastId = Number.isFinite(header) && header > 0 ? header : await latestEventId();
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => {
        if (!closed) controller.enqueue(encoder.encode(s));
      };
      send(`retry: 3000\n: connected\n\n`);
      const deadline = Date.now() + 50_000;
      let beat = 0;
      while (!closed && Date.now() < deadline && !req.signal.aborted) {
        try {
          const rows = await eventsAfter(lastId);
          for (const r of rows) {
            lastId = r.id;
            send(`id: ${r.id}\nevent: update\ndata: ${JSON.stringify({ type: r.type, conversationId: r.conversation_id, at: r.created_at })}\n\n`);
          }
        } catch {
          send(': db error\n\n');
        }
        if (++beat % 7 === 0) send(': keep-alive\n\n');
        await new Promise((r) => setTimeout(r, 2000));
      }
      closed = true;
      controller.close();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
