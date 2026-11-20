import { describe, expect, it } from 'vitest';
import { decide, isOutsideHours, type ModelVerdict } from '@/lib/policy';
import { DEFAULT_SETTINGS, levelToSlider, sliderToLevel, levelFor, levelName, CAREFUL, CONFIDENT, settingsUpdateSchema } from '@/lib/settings-schema';
import { autoShare, autoShareSentence } from '@/lib/threshold-preview';
import { buildClaudeSystem, NEVER_RULES } from '@/lib/tone';
import { parseAnswersCsv } from '@/lib/faq-import';
import { buildSampleCsv } from '@/lib/seed-source';
import { hostIsLocal } from '@/proxy';
import { simulateClaude, simulateGemini } from '@/lib/assistant';

const good: ModelVerdict = { valid: true, confidence: 0.92, needs_human: false, answer: 'Shipping takes 3 to 5 days.', agrees: true };
const base = { settings: DEFAULT_SETTINGS, channel: 'email' as const, message: 'How long is shipping?' };

describe('decision rules (same as the n8n Policy Guard)', () => {
  it('answers automatically when both are sure and agree', () => {
    expect(decide({ ...base, claude: good, gemini: good })).toMatchObject({ auto: true, reasonCode: null });
  });
  it('asks a person below the confidence level', () => {
    expect(decide({ ...base, claude: { ...good, confidence: 0.7 }, gemini: good }).reasonCode).toBe('low_confidence');
  });
  it('reports disagreement and unusual questions', () => {
    expect(decide({ ...base, claude: good, gemini: { ...good, agrees: false } }).reasonCode).toBe('models_disagree');
    expect(decide({ ...base, claude: { ...good, needs_human: true }, gemini: good }).reasonCode).toBe('unusual_question');
  });
  it('respects the master switch, channel switches and blocked words', () => {
    expect(decide({ ...base, settings: { ...DEFAULT_SETTINGS, assistant_enabled: false }, claude: good, gemini: good }).reasonCode).toBe('kill_switch');
    expect(decide({ ...base, settings: { ...DEFAULT_SETTINGS, auto_reply_email: false }, claude: good, gemini: good }).reasonCode).toBe('kill_switch');
    expect(decide({ ...base, message: 'My lawyer says…', claude: good, gemini: good }).reasonCode).toBe('blocked_keyword');
  });
  it('blocks card numbers and foreign email addresses in drafts', () => {
    expect(decide({ ...base, claude: { ...good, answer: 'Your card 4111 1111 1111 1111' }, gemini: good }).reasonCode).toBe('policy');
    expect(decide({ ...base, claude: { ...good, answer: 'Write to bob@other.com' }, gemini: good }).reasonCode).toBe('policy');
  });
  it('uses the per-channel level', () => {
    const s = { ...DEFAULT_SETTINGS, confidence_threshold_chat: 0.6 };
    expect(levelFor(s, 'chat')).toBe(0.6);
    expect(levelFor(s, 'email')).toBe(0.8);
    expect(decide({ ...base, settings: s, channel: 'chat', claude: { ...good, confidence: 0.65 }, gemini: { ...good, confidence: 0.65 } }).auto).toBe(true);
  });
  it('knows business hours', () => {
    const bh = { ...DEFAULT_SETTINGS.business_hours, enabled: true, timezone: 'UTC' };
    expect(isOutsideHours(bh, new Date('2026-11-16T10:00:00Z'))).toBe(false); // Monday
    expect(isOutsideHours(bh, new Date('2026-11-16T18:00:00Z'))).toBe(true);
    expect(isOutsideHours(bh, new Date('2026-11-15T10:00:00Z'))).toBe(true); // Sunday
  });
  it('flags parse errors', () => {
    expect(decide({ ...base, claude: { valid: false, confidence: 0, needs_human: true }, gemini: good }).reasonCode).toBe('parse_error');
  });
});

describe('confidence slider', () => {
  it('maps the ends and round-trips', () => {
    expect(sliderToLevel(0)).toBe(CAREFUL);
    expect(sliderToLevel(100)).toBe(CONFIDENT);
    for (const p of [0, 5, 25, 40, 75, 100]) expect(levelToSlider(sliderToLevel(p))).toBe(p);
    expect(levelName(0.95)).toBe('Careful');
    expect(levelName(0.6)).toBe('Confident');
  });
  it('estimates the automatic share, then uses real history', () => {
    expect(autoShare(0.8, []).share).toBeCloseTo(0.6);
    expect(autoShareSentence(0.8, [])).toMatch(/About 60%/);
    const samples = Array.from({ length: 10 }, (_, i) => ({ channel: 'email' as const, claude: 0.5 + i * 0.05, gemini: 0.95, blocked: false }));
    expect(autoShare(0.8, samples)).toMatchObject({ estimate: false, share: 0.4 });
  });
  it('rejects unknown settings', () => {
    expect(settingsUpdateSchema.safeParse({ nope: 1 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ confidence_threshold: 0.7 }).success).toBe(true);
  });
});

describe('tone', () => {
  it('builds instructions with the chosen style and rules', () => {
    const t = buildClaudeSystem({ tone_style: 'short', tone_custom: '', never_rules: ['competitors'], never_custom: 'Offer free shipping' });
    expect(t).toContain('At most 3 short sentences');
    expect(t).toContain(NEVER_RULES.competitors.instruction);
    expect(t).toContain('- Offer free shipping');
    expect(t).toContain('{{faq_context}}');
  });
});

describe('CSV import', () => {
  it('reads the template', () => {
    const r = parseAnswersCsv(buildSampleCsv());
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(12);
    expect(r.rows.every((x) => !x.problem && x.active)).toBe(true);
  });
  it('explains problems in plain words', () => {
    const r = parseAnswersCsv('question,reply,use_this_answer\nHi there,,yes\nShipping?,3 days,no\nShipping?,4 days,yes');
    expect(r.rows[0].problem).toMatch(/reply is missing/);
    expect(r.rows[1]).toMatchObject({ problem: null, active: false });
    expect(r.rows[2].problem).toMatch(/twice/);
    expect(parseAnswersCsv('a,b\n1,2').error).toMatch(/question/);
  });
});

describe('localhost guard', () => {
  it('only treats local hosts as local', () => {
    for (const h of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'localhost']) expect(hostIsLocal(h)).toBe(true);
    for (const h of ['evil.com', 'localhost.evil.com', '192.168.1.5:3000', null]) expect(hostIsLocal(h)).toBe(false);
  });
});

describe('offline simulator', () => {
  it('is confident with a matching answer and asks a person without one', () => {
    const faq = [{ id: 1, question: 'How long does shipping take?', answer: '3 to 5 days', tags: 'shipping', active: 1, updated_at: '' }];
    const c = simulateClaude('How long does shipping take?', faq, '');
    expect(c.parsed!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(simulateGemini(c.parsed).parsed!.agrees).toBe(true);
    const none = simulateClaude('Meaning of life?', [], '');
    expect(none.parsed!.needs_human).toBe(true);
    expect(simulateGemini(none.parsed).parsed!.agrees).toBe(false);
  });
});

describe('database address clean-up', async () => {
  const { normalizeDbUrl } = await import('@/lib/db-url');
  it('accepts hand-pasted addresses', () => {
    expect(normalizeDbUrl('  "libsql://db-org.turso.io"\n')).toBe('libsql://db-org.turso.io');
    expect(normalizeDbUrl('db-org.turso.io')).toBe('libsql://db-org.turso.io');
    expect(normalizeDbUrl('https://db-org.turso.io/')).toBe('https://db-org.turso.io');
    expect(normalizeDbUrl('TURSO_DATABASE_URL=libsql://x.turso.io')).toBe('libsql://x.turso.io');
    expect(normalizeDbUrl('')).toBe('file:./data/support.db');
    expect(normalizeDbUrl('file:./data/support.db')).toBe('file:./data/support.db');
  });
});
