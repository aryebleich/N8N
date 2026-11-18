import { z } from 'zod';

/** Every runtime setting, its schema and its default. Keys match the `settings` table and the n8n workflow. */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');
const dayHours = z.tuple([hhmm, hhmm]).nullable();
const threshold = z.number().min(0).max(1);

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const businessHoursSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().min(1).max(64).refine((tz) => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
  }, 'Unknown time zone'),
  outside_mode: z.enum(['escalate', 'holding']),
  days: z.object({ mon: dayHours, tue: dayHours, wed: dayHours, thu: dayHours, fri: dayHours, sat: dayHours, sun: dayHours }),
});

const sender = z.string().trim().toLowerCase().min(3).max(320).regex(/^(@[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[a-z0-9.-]+\.[a-z]{2,})$/, 'Use an email address or @domain.com');
const keyword = z.string().trim().min(2).max(100);

export const SETTINGS_SCHEMA = {
  confidence_threshold: threshold,
  confidence_threshold_email: threshold.nullable(),
  confidence_threshold_chat: threshold.nullable(),
  claude_model: z.string().trim().min(3).max(100).regex(/^[a-z0-9.\-]+$/, 'Model ids use lowercase letters, digits, dots and dashes'),
  gemini_model: z.string().trim().min(3).max(100).regex(/^[a-z0-9.\-]+$/, 'Model ids use lowercase letters, digits, dots and dashes'),
  max_tokens: z.number().int().min(256).max(16000),
  request_timeout_ms: z.number().int().min(2000).max(120000),
  auto_reply_email: z.boolean(),
  auto_reply_chat: z.boolean(),
  business_hours: businessHoursSchema,
  blocked_senders: z.array(sender).max(1000),
  blocked_keywords: z.array(keyword).max(500),
  slack_channel_id: z.string().trim().max(32).regex(/^$|^[CGD][A-Z0-9]{6,}$/, 'Slack channel ids look like C0123456789'),
  company_name: z.string().trim().min(1).max(120),
  support_from_email: z.union([z.literal(''), z.email()]),
  sla_minutes: z.object({ high: z.number().int().min(5).max(10080), normal: z.number().int().min(5).max(10080), low: z.number().int().min(5).max(43200) }),
  retention_days: z.number().int().min(7).max(3650).nullable(),
  integration_oracle: z.object({ base_url: z.union([z.literal(''), z.url().regex(/^https:\/\//, 'ORDS must use https')]), user: z.string().trim().max(128) }),
  integration_imap: z.object({ host: z.string().trim().max(255), port: z.number().int().min(1).max(65535), secure: z.boolean(), user: z.string().trim().max(320) }),
  integration_smtp: z.object({ host: z.string().trim().max(255), port: z.number().int().min(1).max(65535), secure: z.boolean(), user: z.string().trim().max(320) }),
} as const;

export type SettingKey = keyof typeof SETTINGS_SCHEMA;
export type Settings = { [K in SettingKey]: z.infer<(typeof SETTINGS_SCHEMA)[K]> };

export const DEFAULT_SETTINGS: Settings = {
  confidence_threshold: 0.8,
  confidence_threshold_email: null,
  confidence_threshold_chat: null,
  claude_model: 'claude-sonnet-5-5',
  gemini_model: 'gemini-flash-latest',
  max_tokens: 1024,
  request_timeout_ms: 30000,
  auto_reply_email: true,
  auto_reply_chat: true,
  business_hours: {
    enabled: false,
    timezone: 'America/New_York',
    outside_mode: 'holding',
    days: { mon: ['09:00', '17:00'], tue: ['09:00', '17:00'], wed: ['09:00', '17:00'], thu: ['09:00', '17:00'], fri: ['09:00', '17:00'], sat: null, sun: null },
  },
  blocked_senders: [],
  blocked_keywords: [],
  slack_channel_id: '',
  company_name: 'Northwind Goods',
  support_from_email: '',
  sla_minutes: { high: 60, normal: 240, low: 1440 },
  retention_days: null,
  integration_oracle: { base_url: '', user: 'SUPPORT_RO' },
  integration_imap: { host: '', port: 993, secure: true, user: '' },
  integration_smtp: { host: '', port: 465, secure: true, user: '' },
};

/** Partial update payload: only known keys, each validated by its own schema. */
export const settingsUpdateSchema = z
  .object(Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([k, s]) => [k, s.optional()])) as { [K in SettingKey]: z.ZodOptional<(typeof SETTINGS_SCHEMA)[K]> })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

export const CLAUDE_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-sonnet-5'] as const;
export const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-pro'] as const;

/** Effective threshold for a channel (per-channel override, else the global value). */
export function thresholdFor(s: Pick<Settings, 'confidence_threshold' | 'confidence_threshold_email' | 'confidence_threshold_chat'>, channel: 'email' | 'chat'): number {
  const o = channel === 'email' ? s.confidence_threshold_email : s.confidence_threshold_chat;
  return o ?? s.confidence_threshold;
}
