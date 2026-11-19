import 'server-only';
import { env } from './env';

/** CORS for the two public widget endpoints only. Origins come from WIDGET_ALLOWED_ORIGINS. */
export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = env().WIDGET_ALLOWED_ORIGINS.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const ok = origin && (allowed.includes('*') || allowed.includes(origin.replace(/\/$/, '')));
  return ok
    ? { 'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : origin!, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
    : { Vary: 'Origin' };
}
