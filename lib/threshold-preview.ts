import type { DecisionSample } from './metrics';

/**
 * "About 60% of questions would be answered automatically." With real history the number
 * comes from your own recent messages; with fewer than 10 it is a typical-shop estimate.
 */
const TYPICAL: [number, number][] = [[0.6, 0.85], [0.7, 0.75], [0.8, 0.6], [0.9, 0.4], [0.95, 0.25]];

export function autoShare(level: number, samples: DecisionSample[], channel?: 'email' | 'chat'): { share: number; basedOn: number; estimate: boolean } {
  const pool = channel ? samples.filter((s) => s.channel === channel) : samples;
  if (pool.length >= 10) {
    const ok = pool.filter((s) => !s.blocked && s.claude >= level && s.gemini >= level).length;
    return { share: ok / pool.length, basedOn: pool.length, estimate: false };
  }
  let share = TYPICAL[TYPICAL.length - 1][1];
  for (let i = 0; i < TYPICAL.length - 1; i++) {
    const [l1, s1] = TYPICAL[i];
    const [l2, s2] = TYPICAL[i + 1];
    if (level <= l1) { share = s1; break; }
    if (level <= l2) { share = s1 + ((level - l1) / (l2 - l1)) * (s2 - s1); break; }
  }
  return { share, basedOn: pool.length, estimate: true };
}

export function autoShareSentence(level: number, samples: DecisionSample[], channel?: 'email' | 'chat') {
  const r = autoShare(level, samples, channel);
  const pct = Math.round(r.share * 100);
  return r.estimate
    ? `About ${pct}% of questions would be answered automatically (a typical estimate; it becomes exact after a few days of real messages).`
    : `About ${pct}% of your last ${r.basedOn} questions would have been answered automatically.`;
}
