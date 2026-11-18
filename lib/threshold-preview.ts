import type { DecisionSample } from './metrics';

/** Share of recent decisions that would have auto-sent at `threshold` (same rule as the n8n DECISION node). */
export function previewAutoSend(samples: DecisionSample[], threshold: number, channel?: 'email' | 'chat') {
  const pool = channel ? samples.filter((s) => s.channel === channel) : samples;
  const wouldSend = pool.filter((s) => s.valid && s.agrees && !s.human && !s.forced && (s.c ?? 0) >= threshold && (s.g ?? 0) >= threshold).length;
  return { total: pool.length, wouldSend, share: pool.length ? wouldSend / pool.length : null };
}
