import 'server-only';
import { get, run } from './db';

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Fixed-window rate limiter stored in Turso, so it holds across serverless instances.
 * One atomic upsert per call.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  await run(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
       window_start = excluded.window_start`,
    [key, windowStart],
  );
  const row = await get<{ count: number }>('SELECT count FROM rate_limits WHERE key = ?', [key]);
  const count = Number(row?.count ?? 1);
  return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec: Math.ceil((windowStart + windowMs - now) / 1000) };
}

/** Current count in the window without incrementing (used to count only failed logins per account). */
export async function rateCount(key: string, windowMs: number): Promise<RateResult & { count: number }> {
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const row = await get<{ count: number; window_start: number }>('SELECT count, window_start FROM rate_limits WHERE key = ?', [key]);
  const count = row && Number(row.window_start) === windowStart ? Number(row.count) : 0;
  return { ok: true, remaining: 0, retryAfterSec: Math.ceil((windowStart + windowMs - now) / 1000), count };
}

export const LIMITS = {
  loginPerIp: { limit: 20, windowMs: 15 * 60_000 },
  loginFailuresPerEmail: { limit: 5, windowMs: 15 * 60_000 },
  promptTest: { limit: 20, windowMs: 60 * 60_000 },
  integrationTest: { limit: 30, windowMs: 10 * 60_000 },
  export: { limit: 10, windowMs: 60 * 60_000 },
  publicPoll: { limit: 120, windowMs: 10 * 60_000 },
  acceptInvite: { limit: 10, windowMs: 15 * 60_000 },
} as const;
