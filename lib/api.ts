import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { getSessionUser, clientIp, type Role, type SessionUser } from './auth';
import { env } from './env';
import { safeEqual } from './crypto';
import { rateLimit } from './rate-limit';
import type { Actor } from './audit';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export interface RouteContext<B, P> {
  req: NextRequest;
  user: SessionUser;
  actor: Actor;
  body: B;
  params: P;
  ip: string;
}

interface RouteOptions<B> {
  /** 'agent' allows both roles; 'owner' allows owners only. */
  role: Role;
  schema?: ZodType<B>;
  rate?: { name: string; limit: number; windowMs: number; per?: 'user' | 'ip' };
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin fetches from older browsers; CSRF token still required
  try {
    const o = new URL(origin);
    const app = new URL(env().APP_URL);
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    return o.host === app.host || o.host === host;
  } catch {
    return false;
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { 'Cache-Control': 'no-store', ...(init?.headers || {}) } });
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) return json({ error: err.message, details: err.details }, { status: err.status });
  if (err instanceof ZodError) {
    return json({ error: 'Some fields are invalid.', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 });
  }
  console.error('[api] unhandled error', err);
  return json({ error: 'Something went wrong on the server. Check the logs and try again.' }, { status: 500 });
}

/**
 * Wraps a route handler with: session auth, role check, CSRF (header token + Origin) on
 * mutating methods, optional per-user/IP rate limit, zod validation of the JSON body,
 * and uniform JSON errors.
 */
export function route<B = undefined, P = Record<string, string>>(opts: RouteOptions<B>, handler: (ctx: RouteContext<B, P>) => Promise<Response | unknown>) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    try {
      const user = await getSessionUser();
      if (!user) throw new ApiError(401, 'Your session has expired. Sign in again.');
      if (opts.role === 'owner' && user.role !== 'owner') throw new ApiError(403, 'Only an owner can do this.');
      if (MUTATING.has(req.method)) {
        if (!sameOrigin(req)) throw new ApiError(403, 'Cross-site request blocked.');
        const token = req.headers.get('x-csrf-token') || '';
        if (!token || !safeEqual(token, user.csrfToken)) throw new ApiError(403, 'Security token missing or expired. Reload the page and try again.');
      }
      const ip = await clientIp();
      if (opts.rate) {
        const who = opts.rate.per === 'ip' ? `ip:${ip}` : `user:${user.id}`;
        const r = await rateLimit(`${opts.rate.name}:${who}`, opts.rate.limit, opts.rate.windowMs);
        if (!r.ok) throw new ApiError(429, `Too many requests. Try again in ${r.retryAfterSec} seconds.`);
      }
      let body = undefined as B;
      if (opts.schema) {
        let raw: unknown = {};
        if (MUTATING.has(req.method)) {
          const text = await req.text();
          if (text.length > 2_000_000) throw new ApiError(413, 'Request body is too large.');
          try { raw = text ? JSON.parse(text) : {}; } catch { throw new ApiError(400, 'Request body must be JSON.'); }
        } else {
          raw = Object.fromEntries(req.nextUrl.searchParams.entries());
        }
        body = opts.schema.parse(raw);
      }
      const params = (await segment.params) ?? ({} as P);
      const out = await handler({ req, user, actor: { id: user.id, email: user.email, ip }, body, params, ip });
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** For n8n → site calls: constant-time shared-secret check on the X-Internal-Secret header. */
export function requireInternalSecret(req: NextRequest) {
  const given = req.headers.get('x-internal-secret') || '';
  if (!given || !safeEqual(given, env().INTERNAL_API_SECRET)) throw new ApiError(401, 'Invalid or missing X-Internal-Secret header.');
}
