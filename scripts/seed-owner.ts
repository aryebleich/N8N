/**
 * Creates (or resets) the first owner account from environment variables:
 *   OWNER_EMAIL=you@example.com OWNER_PASSWORD='a long passphrase 2026' npm run seed:owner
 * Safe to re-run: if the user already exists nothing changes, unless OWNER_RESET=true, which
 * promotes them to owner, reactivates them, sets the new password and signs out their sessions.
 */
import { createClient } from '@libsql/client';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../lib/password';

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const email = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD || '';
  const name = (process.env.OWNER_NAME || 'Owner').trim();
  if (!url) throw new Error('Set TURSO_DATABASE_URL.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Set OWNER_EMAIL to a valid email address.');
  if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) throw new Error('OWNER_PASSWORD needs at least 12 characters, with letters and a digit.');

  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  const now = new Date().toISOString();
  const hash = await hashPassword(password);
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
  let id: string;
  if (existing.rows.length && process.env.OWNER_RESET !== 'true') {
    console.log(`User ${email} already exists; nothing changed. Set OWNER_RESET=true to reset their password and role.`);
    db.close();
    return;
  }
  if (existing.rows.length) {
    id = String(existing.rows[0][0]);
    await db.execute({ sql: "UPDATE users SET password_hash = ?, role = 'owner', active = 1, updated_at = ? WHERE id = ?", args: [hash, now, id] });
    await db.execute({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] });
    console.log(`Updated existing user ${email}: owner, active, new password.`);
  } else {
    id = `usr_${randomBytes(12).toString('base64url')}`;
    await db.execute({ sql: "INSERT INTO users (id, email, name, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'owner', 1, ?, ?)", args: [id, email, name, hash, now, now] });
    console.log(`Created owner ${email}.`);
  }
  await db.execute({
    sql: 'INSERT INTO audit_log (actor_id, actor_email, action, entity, entity_id, old_json, new_json, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    args: ['system', null, 'user.seed_owner', 'user', id, null, JSON.stringify({ email, role: 'owner' }), null, now],
  });
  db.close();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
