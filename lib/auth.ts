import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { all, get, run, nowIso } from './db';
import { env, isProd } from './env';
import { newId, randomToken, sha256 } from './crypto';

export type Role = 'owner' | 'agent';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  sessionId: string;
  csrfToken: string;
}

/** Secure cookies in production. ALLOW_INSECURE_COOKIES=true is only for local end-to-end tests over http. */
const secureCookies = () => isProd() && process.env.ALLOW_INSECURE_COOKIES !== 'true';
export const SESSION_COOKIE = () => (secureCookies() ? '__Host-sid' : 'sid');

export async function clientIp(): Promise<string> {
  const h = await headers();
  if (env().TRUST_PROXY === 'true') {
    const fwd = h.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim().slice(0, 64);
    const real = h.get('x-real-ip');
    if (real) return real.trim().slice(0, 64);
  }
  return '0.0.0.0';
}

/** Creates a session row and sets the HTTP-only cookie. Returns the CSRF token. */
export async function createSession(userId: string): Promise<string> {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const h = await headers();
  const ttlMs = env().SESSION_TTL_HOURS * 3600_000;
  const expires = new Date(Date.now() + ttlMs);
  await run('INSERT INTO sessions (id, user_id, csrf_token, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    sha256(token), userId, csrf, nowIso(), expires.toISOString(), await clientIp(), (h.get('user-agent') || '').slice(0, 300),
  ]);
  await run('UPDATE users SET last_login_at = ? WHERE id = ?', [nowIso(), userId]);
  await run("DELETE FROM sessions WHERE expires_at < ?", [nowIso()]);
  (await cookies()).set(SESSION_COOKIE(), token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    path: '/',
    expires,
  });
  return csrf;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE())?.value;
  if (token) await run('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
  jar.delete(SESSION_COOKIE());
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE())?.value;
  if (!token || token.length > 200) return null;
  const row = await get<{ sid: string; csrf_token: string; id: string; email: string; name: string | null; role: Role }>(
    `SELECT s.id AS sid, s.csrf_token, u.id, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ? AND u.active = 1`,
    [sha256(token), nowIso()],
  );
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, sessionId: row.sid, csrfToken: row.csrf_token };
}

/** For server components: redirects to /login when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

/** For owner-only pages. Agents are sent back to the dashboard. */
export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'owner') redirect('/?denied=1');
  return user;
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

export async function listAssignableUsers(): Promise<{ id: string; email: string; name: string | null; role: Role }[]> {
  return all('SELECT id, email, name, role FROM users WHERE active = 1 AND password_hash IS NOT NULL ORDER BY COALESCE(name, email)');
}

/** One-time token for invites and password resets. Returns the raw token (only ever shown once). */
export async function createUserToken(userId: string, purpose: 'invite' | 'reset', createdBy: string, ttlHours = 72): Promise<string> {
  const token = randomToken(32);
  await run('UPDATE user_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [nowIso(), userId]);
  await run('INSERT INTO user_tokens (token_hash, user_id, purpose, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)', [
    sha256(token), userId, purpose, createdBy, nowIso(), new Date(Date.now() + ttlHours * 3600_000).toISOString(),
  ]);
  return token;
}

export const newUserId = () => newId('usr_');
