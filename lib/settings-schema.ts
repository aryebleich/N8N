import { z } from 'zod';

/**
 * Every setting the panel and the n8n workflow read from the Turso `settings` table.
 * Keys used by n8n: assistant_enabled, confidence_threshold(_email/_chat), auto_reply_email,
 * auto_reply_chat, business_hours, blocked_senders, blocked_keywords, company_name,
 * support_from_email, claude_model, gemini_model, max_tokens, request_timeout_ms.
 */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:00');
const dayHours = z.tuple([hhmm, hhmm]).nullable();
const level = z.number().min(0).max(1);

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export const businessHoursSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().min(1).max(64).refine((tz) => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
  }, 'That time zone is not recognised'),
  outside_mode: z.enum(['escalate', 'holding']),
  outside_message: z.string().max(500),
  days: z.object({ mon: dayHours, tue: dayHours, wed: dayHours, thu: dayHours, fri: dayHours, sat: dayHours, sun: dayHours }),
});

export const TONE_STYLES = ['friendly', 'professional', 'short', 'custom'] as const;
export const NEVER_RULE_IDS = ['promise_money', 'share_other_customers', 'payment_details', 'legal_medical_advice', 'competitors', 'guess_dates', 'emoji'] as const;

const sender = z.string().trim().toLowerCase().min(3).max(320).regex(/^(@[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[a-z0-9.-]+\.[a-z]{2,})$/, 'Use an email address or @domain.com');

export const SETTINGS_SCHEMA = {
  assistant_enabled: z.boolean(),
  confidence_threshold: level,
  confidence_threshold_email: level.nullable(),
  confidence_threshold_chat: level.nullable(),
  auto_reply_email: z.boolean(),
  auto_reply_chat: z.boolean(),
  business_hours: businessHoursSchema,
  blocked_senders: z.array(sender).max(1000),
  blocked_keywords: z.array(z.string().trim().min(2).max(100)).max(500),
  slack_channel: z.string().trim().max(80).regex(/^$|^#?[a-z0-9._-]{1,80}$|^[CGD][A-Z0-9]{6,}$/, 'Use a channel name like #support or an id like C0123456789'),
  company_name: z.string().trim().min(1).max(120),
  support_from_email: z.union([z.literal(''), z.email()]),
  claude_model: z.string().trim().min(3).max(100).regex(/^[a-z0-9.\-]+$/),
  gemini_model: z.string().trim().min(3).max(100).regex(/^[a-z0-9.\-]+$/),
  max_tokens: z.number().int().min(256).max(16000),
  request_timeout_ms: z.number().int().min(2000).max(120000),
  tone_style: z.enum(TONE_STYLES),
  tone_custom: z.string().max(1000),
  never_rules: z.array(z.enum(NEVER_RULE_IDS)).max(NEVER_RULE_IDS.length),
  never_custom: z.string().max(2000),
  prompt_mode: z.enum(['recommended', 'custom']),
  setup_complete: z.boolean(),
  sla_minutes: z.object({ high: z.number().int().min(5), normal: z.number().int().min(5), low: z.number().int().min(5) }),
} as const;

export type SettingKey = keyof typeof SETTINGS_SCHEMA;
export type Settings = { [K in SettingKey]: z.infer<(typeof SETTINGS_SCHEMA)[K]> };

export const DEFAULT_SETTINGS: Settings = {
  assistant_enabled: true,
  confidence_threshold: 0.8,
  confidence_threshold_email: null,
  confidence_threshold_chat: null,
  auto_reply_email: true,
  auto_reply_chat: true,
  business_hours: {
    enabled: false,
    timezone: 'America/New_York',
    outside_mode: 'holding',
    outside_message: 'Thanks for your message. We are closed right now. A person from our team will reply on the next business day, from 9:00.',
    days: { mon: ['09:00', '17:00'], tue: ['09:00', '17:00'], wed: ['09:00', '17:00'], thu: ['09:00', '17:00'], fri: ['09:00', '17:00'], sat: null, sun: null },
  },
  blocked_senders: [],
  blocked_keywords: ['lawyer', 'chargeback', 'legal action'],
  slack_channel: '',
  company_name: 'Northwind Goods',
  support_from_email: '',
  claude_model: 'claude-sonnet-5-5',
  gemini_model: 'gemini-flash-latest',
  max_tokens: 1024,
  request_timeout_ms: 30000,
  tone_style: 'friendly',
  tone_custom: '',
  never_rules: ['promise_money', 'share_other_customers', 'payment_details', 'legal_medical_advice'],
  never_custom: '',
  prompt_mode: 'recommended',
  setup_complete: false,
  sla_minutes: { high: 60, normal: 240, low: 1440 },
};

export const settingsUpdateSchema = z
  .object(Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([k, s]) => [k, s.optional()])) as { [K in SettingKey]: z.ZodOptional<(typeof SETTINGS_SCHEMA)[K]> })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to save');

/** The confidence level a channel uses: its own if set, otherwise the main one. */
export function levelFor(s: Pick<Settings, 'confidence_threshold' | 'confidence_threshold_email' | 'confidence_threshold_chat'>, channel: 'email' | 'chat'): number {
  return (channel === 'email' ? s.confidence_threshold_email : s.confidence_threshold_chat) ?? s.confidence_threshold;
}

/** Slider position (0 = Careful, 100 = Confident) ↔ the number n8n compares against. */
export const CAREFUL = 0.95;
export const CONFIDENT = 0.55; // 0.95 → 0.55 in 5% slider steps of exactly 0.02
export const sliderToLevel = (pos: number) => Math.round((CAREFUL - (CAREFUL - CONFIDENT) * (pos / 100)) * 100) / 100;
export const levelToSlider = (lvl: number) => Math.round(((CAREFUL - Math.min(CAREFUL, Math.max(CONFIDENT, lvl))) / (CAREFUL - CONFIDENT)) * 100);
export function levelName(lvl: number): string {
  if (lvl >= 0.9) return 'Careful';
  if (lvl >= 0.78) return 'Balanced';
  if (lvl >= 0.68) return 'Fairly confident';
  return 'Confident';
}
