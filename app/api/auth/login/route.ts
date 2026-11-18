import { type NextRequest } from 'next/server';
import { get } from '@/lib/db';
import { clientIp, createSession } from '@/lib/auth';
import { json, errorResponse, ApiError } from '@/lib/api';
import { loginSchema } from '@/lib/validators';
import { DUMMY_HASH, verifyPassword } from '@/lib/password';
import { rateCount, rateLimit, LIMITS } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(env().APP_URL).host && new URL(origin).host !== req.headers.get('host')) {
      throw new ApiError(403, 'Cross-site request blocked.');
    }
    const ip = await clientIp();
    const byIp = await rateLimit(`login:ip:${ip}`, LIMITS.loginPerIp.limit, LIMITS.loginPerIp.windowMs);
    if (!byIp.ok) throw new ApiError(429, `Too many sign-in attempts. Try again in ${Math.ceil(byIp.retryAfterSec / 60)} minutes.`);
    const body = loginSchema.parse(await req.json().catch(() => ({})));
    // Per-account limit counts failed attempts only, so normal sign-ins never lock an owner out.
    const failKey = `login:fail:${body.email}`;
    const failures = await rateCount(failKey, LIMITS.loginFailuresPerEmail.windowMs);
    if (failures.count >= LIMITS.loginFailuresPerEmail.limit) throw new ApiError(429, `Too many failed sign-ins for this account. Try again in ${Math.ceil(failures.retryAfterSec / 60)} minutes.`);

    const user = await get<{ id: string; email: string; password_hash: string | null; active: number }>('SELECT id, email, password_hash, active FROM users WHERE email = ?', [body.email]);
    const ok = await verifyPassword(user?.password_hash ?? DUMMY_HASH, body.password);
    if (!user || !ok || !user.password_hash || user.active !== 1) {
      await rateLimit(failKey, LIMITS.loginFailuresPerEmail.limit, LIMITS.loginFailuresPerEmail.windowMs);
      await audit({ id: user?.id ?? 'anonymous', email: body.email, ip }, 'auth.login_failed', 'user', user?.id ?? null, null, { reason: !user ? 'unknown_email' : user.active !== 1 ? 'inactive' : 'bad_password' });
      throw new ApiError(401, 'Email or password is incorrect.');
    }
    await createSession(user.id);
    await audit({ id: user.id, email: user.email, ip }, 'auth.login', 'user', user.id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
