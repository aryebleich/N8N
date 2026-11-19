import 'server-only';
import type { InStatement } from '@libsql/client';
import { nowIso, run } from './db';

/** With no login, every change made in the panel is recorded as "admin" plus the client IP. */
export interface Actor {
  id: string;
  email?: string | null;
  ip?: string | null;
}

export const ADMIN: Actor = { id: 'admin' };
export const N8N_ACTOR: Actor = { id: 'n8n' };
export const SYSTEM: Actor = { id: 'system' };

export function auditStatement(actor: Actor, action: string, entity: string, entityId: string | number | null, oldValue?: unknown, newValue?: unknown): InStatement {
  return {
    sql: 'INSERT INTO audit_log (actor_id, actor_email, action, entity, entity_id, old_json, new_json, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    args: [
      actor.id, actor.email ?? null, action, entity, entityId == null ? null : String(entityId),
      oldValue === undefined ? null : JSON.stringify(oldValue), newValue === undefined ? null : JSON.stringify(newValue), actor.ip ?? null, nowIso(),
    ],
  };
}

export async function audit(actor: Actor, action: string, entity: string, entityId: string | number | null, oldValue?: unknown, newValue?: unknown) {
  const st = auditStatement(actor, action, entity, entityId, oldValue, newValue) as { sql: string; args: never };
  await run(st.sql, st.args);
}
