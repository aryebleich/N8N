import 'server-only';
import { all, batch, get, nowIso } from './db';
import { decrypt, encrypt, last4 } from './crypto';
import { auditStatement, type Actor } from './audit';
import type { SecretName } from './validators';

const ENV_FALLBACK: Record<SecretName, string> = {
  anthropic_api_key: 'ANTHROPIC_API_KEY',
  google_ai_api_key: 'GOOGLE_AI_API_KEY',
  slack_bot_token: 'SLACK_BOT_TOKEN',
  oracle_ords_password: 'ORACLE_ORDS_PASSWORD',
  imap_password: 'IMAP_PASSWORD',
  smtp_password: 'SMTP_PASSWORD',
};

/** Server-only: decrypts a stored key, or falls back to the matching environment variable. */
export async function getSecret(name: SecretName): Promise<string | null> {
  const row = await get<{ ciphertext: string; iv: string; tag: string }>('SELECT ciphertext, iv, tag FROM api_keys WHERE name = ?', [name]);
  if (row) return decrypt(row, name);
  const fromEnv = process.env[ENV_FALLBACK[name]];
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : null;
}

export interface SecretInfo {
  name: SecretName;
  last4: string | null;
  updated_at: string | null;
  source: 'database' | 'environment' | 'missing';
}

/** Safe to send to the browser: never includes the secret, only the last 4 characters. */
export async function listSecretInfo(): Promise<SecretInfo[]> {
  const rows = await all<{ name: SecretName; last4: string; updated_at: string }>('SELECT name, last4, updated_at FROM api_keys');
  const byName = new Map(rows.map((r) => [r.name, r]));
  return (Object.keys(ENV_FALLBACK) as SecretName[]).map((name) => {
    const r = byName.get(name);
    if (r) return { name, last4: r.last4, updated_at: r.updated_at, source: 'database' as const };
    const e = process.env[ENV_FALLBACK[name]];
    if (e && e.trim()) return { name, last4: last4(e.trim()), updated_at: null, source: 'environment' as const };
    return { name, last4: null, updated_at: null, source: 'missing' as const };
  });
}

export async function saveSecrets(secrets: Partial<Record<SecretName, string>>, actor: Actor): Promise<SecretName[]> {
  const statements = [];
  const names: SecretName[] = [];
  const now = nowIso();
  for (const [name, value] of Object.entries(secrets) as [SecretName, string][]) {
    if (!value) continue;
    const sealed = encrypt(value, name);
    statements.push({
      sql: `INSERT INTO api_keys (name, ciphertext, iv, tag, last4, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag,
              last4 = excluded.last4, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      args: [name, sealed.ciphertext, sealed.iv, sealed.tag, last4(value), now, actor.id],
    });
    statements.push(auditStatement(actor, 'api_key.update', 'api_key', name, null, { last4: last4(value) }));
    names.push(name);
  }
  if (statements.length) await batch(statements);
  return names;
}
