import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { HttpError } from './errors';
import { env } from './env';
import { safeEqual } from './crypto';
import type { Actor } from './audit';

export { HttpError };

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, { ...init, headers: { 'Cache-Control': 'no-store', ...(init?.headers || {}) } });

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return json({ error: err.issues.map((i) => i.message).join(' ') }, { status: 400 });
  console.error('[api]', err);
  return json({ error: 'Something went wrong on the server. Try again; if it keeps happening, check the server log.' }, { status: 500 });
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * There is no login, so the only protection for admin routes is: the request must come
 * from this panel's own pages (same origin), so another website cannot change settings
 * in the background. The localhost-only rule lives in proxy.ts.
 */
function sameOrigin(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') || req.headers.get('host'));
  } catch {
    return false;
  }
}

export function clientIp(req: NextRequest) {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'local').trim().slice(0, 64);
}

export function adminRoute<B = undefined, P = Record<string, string>>(
  schema: ZodType<B> | null,
  handler: (ctx: { req: NextRequest; body: B; params: P; actor: Actor }) => Promise<unknown>,
) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    try {
      if (MUTATING.has(req.method) && !sameOrigin(req)) throw new HttpError(403, 'This change was blocked because it did not come from the admin panel itself.');
      let body = undefined as B;
      if (schema) {
        let raw: unknown = Object.fromEntries(req.nextUrl.searchParams.entries());
        if (MUTATING.has(req.method)) {
          const text = await req.text();
          if (text.length > 2_000_000) throw new HttpError(413, 'That is too much data to send at once.');
          try { raw = text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'The request could not be read.'); }
        }
        body = schema.parse(raw);
      }
      const out = await handler({ req, body, params: (await segment.params) ?? ({} as P), actor: { id: 'admin', ip: clientIp(req) } });
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** n8n calls: shared secret in the X-Internal-Secret header (constant-time compare). */
export function requireInternalSecret(req: NextRequest) {
  const secret = env().INTERNAL_API_SECRET;
  if (!secret) throw new HttpError(503, 'INTERNAL_API_SECRET is not set in .env, so the n8n endpoints are turned off.');
  const given = req.headers.get('x-internal-secret') || '';
  if (!given || !safeEqual(given, secret)) throw new HttpError(401, 'Invalid or missing X-Internal-Secret header.');
}
