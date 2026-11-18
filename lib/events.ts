import 'server-only';
import type { InStatement } from '@libsql/client';
import { all, nowIso } from './db';

export type EventType = 'message.created' | 'conversation.updated' | 'escalation.created' | 'escalation.updated' | 'note.created';

export function eventStatement(type: EventType, conversationId: string | null, payload: Record<string, unknown> = {}): InStatement {
  return {
    sql: 'INSERT INTO events (type, conversation_id, payload_json, created_at) VALUES (?, ?, ?, ?)',
    args: [type, conversationId, JSON.stringify(payload), nowIso()],
  };
}

export interface EventRow {
  id: number;
  type: EventType;
  conversation_id: string | null;
  payload_json: string;
  created_at: string;
}

export async function eventsAfter(lastId: number, limit = 100): Promise<EventRow[]> {
  return all<EventRow>('SELECT id, type, conversation_id, payload_json, created_at FROM events WHERE id > ? ORDER BY id ASC LIMIT ?', [lastId, limit]);
}

export async function latestEventId(): Promise<number> {
  const rows = await all<{ id: number }>('SELECT COALESCE(MAX(id), 0) AS id FROM events');
  return Number(rows[0]?.id ?? 0);
}
