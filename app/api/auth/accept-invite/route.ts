import { type NextRequest } from 'next/server';
import { batch, get, nowIso } from '@/lib/db';
import { clientIp, createSession, revokeUserSessions } from '@/lib/auth';
import { json, errorResponse, ApiError } from '@/lib/api';
import { acceptInviteSchema } from '@/lib/validators';
import { hashPassword } from '@/lib/password';
import { sha256 } from '@/lib/crypto';
import { rateLimit, LIMITS } from '@/lib/rate-limit';
import { auditStatement } from '@/lib/audit';

export const runtime = 'nodejs';

/** Sets the password for an invited user or completes a password reset, then signs in. */
export async function POST(req: NextRequest) {
  try {
    const ip = await clientIp();
    const rl = await rateLimit(`accept:ip:${ip}`, LIMITS.acceptInvite.limit, LIMITS.acceptInvite.windowMs);
    if (!rl.ok) throw new ApiError(429, 'Too many attempts. Try again later.');
    const body = acceptInviteSchema.parse(await req.json().catch(() => ({})));
    const t = await get<{ token_hash: string; user_id: string; purpose: string; email: string; active: number }>(
      `SELECT t.token_hash, t.user_id, t.purpose, u.email, u.active FROM user_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ?`,
      [sha256(body.token), nowIso()],
    );
    if (!t || t.active !== 1) throw new ApiError(400, 'This link is invalid, expired or already used. Ask an owner for a new one.');
    const now = nowIso();
    await batch([
      { sql: 'UPDATE users SET password_hash = ?, name = ?, updated_at = ? WHERE id = ?', args: [await hashPassword(body.password), body.name, now, t.user_id] },
      { sql: 'UPDATE user_tokens SET used_at = ? WHERE token_hash = ?', args: [now, t.token_hash] },
      auditStatement({ id: t.user_id, email: t.email, ip }, t.purpose === 'invite' ? 'user.accept_invite' : 'user.reset_password', 'user', t.user_id),
    ]);
    await revokeUserSessions(t.user_id);
    await createSession(t.user_id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
