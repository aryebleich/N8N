import 'server-only';
import type { InStatement } from '@libsql/client';
import { run, nowIso } from './db';

export interface Actor {
  id: string;
  email?: string | null;
  ip?: string | null;
}

const SECRET_KEY = /password|secret|token|api_key|ciphertext|hash/i;

/** Replaces secret-looking fields so the audit log never stores credentials. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : redact(v)]));
  }
  return value;
}

const toJson = (v: unknown) => (v === undefined ? null : JSON.stringify(redact(v)));

export function auditStatement(actor: Actor, action: string, entity: string, entityId: string | number | null, oldValue?: unknown, newValue?: unknown): InStatement {
  return {
    sql: 'INSERT INTO audit_log (actor_id, actor_email, action, entity, entity_id, old_json, new_json, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    args: [actor.id, actor.email ?? null, action, entity, entityId == null ? null : String(entityId), toJson(oldValue), toJson(newValue), actor.ip ?? null, nowIso()],
  };
}

export async function audit(actor: Actor, action: string, entity: string, entityId: string | number | null, oldValue?: unknown, newValue?: unknown) {
  const st = auditStatement(actor, action, entity, entityId, oldValue, newValue);
  await run(typeof st === 'string' ? st : st.sql, typeof st === 'string' ? [] : (st.args as never));
}

export const SYSTEM_ACTOR: Actor = { id: 'system', email: null };
export const N8N_ACTOR: Actor = { id: 'n8n', email: null };
