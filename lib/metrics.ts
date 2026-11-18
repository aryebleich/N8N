import 'server-only';
import { all, get } from './db';
import { median } from './utils';
import { maskEmail } from './mask';

export interface WindowStats {
  received: number;
  autoReplied: number;
  escalated: number;
  failed: number;
  decisions: number;
  autoRate: number | null;
  escalationRate: number | null;
  avgClaude: number | null;
  avgGemini: number | null;
  medianResponseMs: number | null;
}

async function windowStats(sinceIso: string): Promise<WindowStats> {
  const [rec, dec, esc, fail, times] = await Promise.all([
    get<{ n: number }>("SELECT count(*) AS n FROM messages WHERE role = 'customer' AND created_at >= ?", [sinceIso]),
    get<{ n: number; auto: number; escalated: number; c: number | null; g: number | null }>(
      `SELECT count(*) AS n,
              sum(CASE WHEN outcome = 'auto' AND COALESCE(delivery_status, '') <> 'failed' THEN 1 ELSE 0 END) AS auto,
              sum(CASE WHEN outcome <> 'auto' OR delivery_status = 'failed' THEN 1 ELSE 0 END) AS escalated,
              avg(claude_confidence) AS c, avg(gemini_confidence) AS g
         FROM ai_decisions WHERE created_at >= ?`,
      [sinceIso],
    ),
    get<{ n: number }>('SELECT count(*) AS n FROM escalations WHERE created_at >= ?', [sinceIso]),
    get<{ n: number }>("SELECT count(*) AS n FROM escalations WHERE created_at >= ? AND reason_code IN ('system_error', 'delivery_failed')", [sinceIso]),
    all<{ ms: number }>('SELECT response_ms AS ms FROM ai_decisions WHERE created_at >= ? AND response_ms IS NOT NULL ORDER BY id DESC LIMIT 5000', [sinceIso]),
  ]);
  const decisions = Number(dec?.n ?? 0);
  const auto = Number(dec?.auto ?? 0);
  const escalatedDecisions = Number(dec?.escalated ?? 0);
  return {
    received: Number(rec?.n ?? 0),
    autoReplied: auto,
    escalated: Number(esc?.n ?? 0),
    failed: Number(fail?.n ?? 0),
    decisions,
    autoRate: decisions ? auto / decisions : null,
    escalationRate: decisions ? escalatedDecisions / decisions : null,
    avgClaude: dec?.c == null ? null : Number(dec.c),
    avgGemini: dec?.g == null ? null : Number(dec.g),
    medianResponseMs: median(times.map((t) => Number(t.ms))),
  };
}

export async function dashboardStats() {
  const now = Date.now();
  const [d1, d7] = await Promise.all([windowStats(new Date(now - 86_400_000).toISOString()), windowStats(new Date(now - 7 * 86_400_000).toISOString())]);
  return { last24h: d1, last7d: d7 };
}

import type { VolumePoint } from './metrics-types';
export type { VolumePoint };

/** Customer messages per day and channel, last 14 days, zero-filled. */
export async function volumeByChannel(days = 14): Promise<VolumePoint[]> {
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await all<{ day: string; channel: string; n: number }>(
    `SELECT substr(m.created_at, 1, 10) AS day, c.channel AS channel, count(*) AS n
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.role = 'customer' AND m.created_at >= ?
      GROUP BY day, c.channel`,
    [since.toISOString()],
  );
  const map = new Map<string, VolumePoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    map.set(d, { day: d, email: 0, chat: 0 });
  }
  for (const r of rows) {
    const p = map.get(r.day);
    if (p && (r.channel === 'email' || r.channel === 'chat')) p[r.channel] = Number(r.n);
  }
  return [...map.values()];
}

export interface OpenEscalation {
  id: number;
  conversationId: string | null;
  channel: string | null;
  reasonCode: string | null;
  priority: string;
  createdAt: string;
  slaDueAt: string | null;
  assignee: string | null;
  assigneeId: string | null;
  customer: string;
}

export async function openEscalations(limit = 8): Promise<OpenEscalation[]> {
  const rows = await all<Record<string, unknown>>(
    `SELECT e.id, e.conversation_id, e.channel, e.reason_code, e.priority, e.created_at, e.sla_due_at, e.assignee_id,
            COALESCE(u.name, u.email) AS assignee, c.customer_email
       FROM escalations e LEFT JOIN users u ON u.id = e.assignee_id LEFT JOIN conversations c ON c.id = e.conversation_id
      WHERE e.status IN ('open', 'in_progress')
      ORDER BY e.created_at ASC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    conversationId: (r.conversation_id as string) || null,
    channel: (r.channel as string) || null,
    reasonCode: (r.reason_code as string) || null,
    priority: String(r.priority || 'normal'),
    createdAt: String(r.created_at),
    slaDueAt: (r.sla_due_at as string) || null,
    assignee: (r.assignee as string) || null,
    assigneeId: (r.assignee_id as string) || null,
    customer: maskEmail(r.customer_email as string) || '—',
  }));
}

export interface DecisionSample {
  channel: 'email' | 'chat';
  c: number | null;
  g: number | null;
  valid: boolean;
  agrees: boolean;
  human: boolean;
  forced: boolean;
}

/** Recent decisions for the threshold preview (last 30 days, at most 2000). */
export async function decisionSamples(): Promise<DecisionSample[]> {
  const rows = await all<Record<string, unknown>>(
    `SELECT channel, claude_confidence, gemini_confidence, both_valid, gemini_agrees, any_needs_human, force_human
       FROM ai_decisions WHERE created_at >= ? ORDER BY id DESC LIMIT 2000`,
    [new Date(Date.now() - 30 * 86_400_000).toISOString()],
  );
  return rows.map((r) => ({
    channel: r.channel === 'chat' ? 'chat' : 'email',
    c: r.claude_confidence == null ? null : Number(r.claude_confidence),
    g: r.gemini_confidence == null ? null : Number(r.gemini_confidence),
    valid: Number(r.both_valid) === 1,
    agrees: Number(r.gemini_agrees) === 1,
    human: Number(r.any_needs_human) === 1,
    forced: Number(r.force_human) === 1,
  }));
}
