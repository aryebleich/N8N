import 'server-only';
import { all, batch, get, nowIso } from './db';
import { auditStatement, type Actor } from './audit';
import { ApiError } from './api';
import { createUserToken, newUserId, revokeUserSessions, type Role } from './auth';
import { env } from './env';
import { sendEmail } from './mailer';
import { getSettings } from './settings';

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  active: number;
  has_password: number;
  created_at: string;
  last_login_at: string | null;
}

export async function listUsers(): Promise<UserRow[]> {
  return all<UserRow>('SELECT id, email, name, role, active, (password_hash IS NOT NULL) AS has_password, created_at, last_login_at FROM users ORDER BY active DESC, role, email');
}

async function emailLink(to: string, subject: string, intro: string, link: string): Promise<boolean> {
  try {
    const s = await getSettings();
    await sendEmail({ to, subject, text: `${intro}\n\n${link}\n\nThe link works once and expires in 72 hours.\n\n${s.company_name} support console` });
    return true;
  } catch {
    return false;
  }
}

export async function inviteUser(email: string, name: string, role: Role, actor: Actor) {
  const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) throw new ApiError(409, 'A user with this email already exists.');
  const id = newUserId();
  const now = nowIso();
  await batch([
    { sql: 'INSERT INTO users (id, email, name, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 1, ?, ?)', args: [id, email, name || null, role, now, now] },
    auditStatement(actor, 'user.invite', 'user', id, null, { email, role }),
  ]);
  const token = await createUserToken(id, 'invite', actor.id);
  const link = `${env().APP_URL}/accept-invite?token=${encodeURIComponent(token)}`;
  const emailed = await emailLink(email, 'You are invited to the support console', `${actor.email ?? 'An owner'} invited you to the support console as ${role === 'owner' ? 'an owner' : 'an agent'}. Set your password here:`, link);
  return { id, link, emailed };
}

async function ownersLeft(excludingId: string) {
  const r = await get<{ n: number }>("SELECT count(*) AS n FROM users WHERE role = 'owner' AND active = 1 AND password_hash IS NOT NULL AND id <> ?", [excludingId]);
  return Number(r?.n ?? 0);
}

export async function updateUser(id: string, action: { action: 'role'; role: Role } | { action: 'deactivate' } | { action: 'activate' } | { action: 'reset_password' }, actor: Actor) {
  const user = await get<UserRow>('SELECT id, email, name, role, active FROM users WHERE id = ?', [id]);
  if (!user) throw new ApiError(404, 'User not found.');
  const now = nowIso();
  if (action.action === 'role') {
    if (user.role === 'owner' && action.role === 'agent' && (await ownersLeft(id)) === 0) throw new ApiError(400, 'There must be at least one active owner.');
    await batch([
      { sql: 'UPDATE users SET role = ?, updated_at = ? WHERE id = ?', args: [action.role, now, id] },
      auditStatement(actor, 'user.role', 'user', id, { role: user.role }, { role: action.role }),
    ]);
    await revokeUserSessions(id);
    return {};
  }
  if (action.action === 'deactivate') {
    if (id === actor.id) throw new ApiError(400, 'You cannot deactivate your own account.');
    if (user.role === 'owner' && (await ownersLeft(id)) === 0) throw new ApiError(400, 'There must be at least one active owner.');
    await batch([
      { sql: 'UPDATE users SET active = 0, updated_at = ? WHERE id = ?', args: [now, id] },
      { sql: "UPDATE escalations SET assignee_id = NULL, status = CASE WHEN status = 'in_progress' THEN 'open' ELSE status END WHERE assignee_id = ? AND status <> 'resolved'", args: [id] },
      auditStatement(actor, 'user.deactivate', 'user', id, { active: true }, { active: false }),
    ]);
    await revokeUserSessions(id);
    return {};
  }
  if (action.action === 'activate') {
    await batch([
      { sql: 'UPDATE users SET active = 1, updated_at = ? WHERE id = ?', args: [now, id] },
      auditStatement(actor, 'user.activate', 'user', id, { active: false }, { active: true }),
    ]);
    return {};
  }
  const token = await createUserToken(id, 'reset', actor.id);
  const link = `${env().APP_URL}/accept-invite?token=${encodeURIComponent(token)}`;
  await revokeUserSessions(id);
  await batch([auditStatement(actor, 'user.reset_password', 'user', id, null, { sessionsRevoked: true })]);
  const emailed = await emailLink(user.email, 'Reset your support console password', 'An owner started a password reset for your account. Choose a new password here:', link);
  return { link, emailed };
}
