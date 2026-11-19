import 'server-only';
import { all, get } from './db';
import { bucketOf } from './conversations';
import { safeCustomerText } from './mask';
import { whyFor } from './why';

export interface TodayNumbers { total: number; auto: number; waiting: number; done: number; email: number; chat: number }

/** Today's numbers (since local midnight of the server). */
export async function todayNumbers(): Promise<TodayNumbers> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await all<{ status: string; channel: string }>(
    'SELECT status, channel FROM conversations WHERE COALESCE(last_message_at, updated_at) >= ?',
    [start.toISOString()],
  );
  const n: TodayNumbers = { total: rows.length, auto: 0, waiting: 0, done: 0, email: 0, chat: 0 };
  for (const r of rows) {
    n[bucketOf(r.status)]++;
    if (r.channel === 'email') n.email++; else n.chat++;
  }
  return n;
}

export const totalWaiting = async () => Number((await get<{ n: number }>("SELECT count(*) AS n FROM conversations WHERE status NOT IN ('auto_replied', 'resolved')"))?.n ?? 0);

export interface NeedsPerson { id: string; channel: 'email' | 'chat'; customer: string; preview: string; why: string; at: string }

export async function latestNeedingPerson(limit = 5): Promise<NeedsPerson[]> {
  const rows = await all<{ id: string; channel: 'email' | 'chat'; customer_email: string | null; customer_name: string | null; at: string; preview: string | null; reason_code: string | null }>(
    `SELECT c.id, c.channel, c.customer_email, c.customer_name, COALESCE(c.last_message_at, c.updated_at) AS at,
            (SELECT m.body FROM messages m WHERE m.conversation_id = c.id AND m.role = 'customer' ORDER BY m.id DESC LIMIT 1) AS preview,
            (SELECT e.reason_code FROM escalations e WHERE e.conversation_id = c.id ORDER BY e.id DESC LIMIT 1) AS reason_code
       FROM conversations c WHERE c.status NOT IN ('auto_replied', 'resolved') ORDER BY at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id, channel: r.channel, at: r.at,
    customer: r.customer_name || r.customer_email || (r.channel === 'chat' ? 'Website visitor' : 'Unknown sender'),
    preview: safeCustomerText((r.preview || '').replace(/^Subject: .*\n\n/, '').slice(0, 140)),
    why: whyFor(r.reason_code).title,
  }));
}

/**
 * For the confidence slider: the last 300 AI decisions with both scores. For a level L, a
 * message would be answered automatically when both AIs scored ≥ L and nothing else
 * (disagreement, a safety rule, switched off) stopped it.
 */
export interface DecisionSample { channel: 'email' | 'chat'; claude: number; gemini: number; blocked: boolean }

export async function recentDecisionSamples(): Promise<DecisionSample[]> {
  const rows = await all<{ meta_json: string; channel: 'email' | 'chat' }>(
    `SELECT m.meta_json, c.channel FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.role = 'assistant' AND m.meta_json LIKE '%"decision"%' ORDER BY m.id DESC LIMIT 300`,
  );
  const out: DecisionSample[] = [];
  for (const r of rows) {
    try {
      const m = JSON.parse(r.meta_json);
      const c = Number(m.claude?.confidence);
      const g = Number(m.gemini?.confidence);
      if (!Number.isFinite(c) || !Number.isFinite(g)) continue;
      const rc = m.reasonCode ?? m.decision?.reasonCode ?? null;
      const blocked = m.decision?.forceHuman === true || m.decision?.anyNeedsHuman === true || m.decision?.geminiAgrees === false || (rc && rc !== 'low_confidence');
      out.push({ channel: r.channel, claude: c, gemini: g, blocked: !!blocked });
    } catch {
      /* skip */
    }
  }
  return out;
}
