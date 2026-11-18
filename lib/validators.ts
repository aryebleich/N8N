import { z } from 'zod';
import { PROMPT_IDS } from './prompt-template';

export { settingsUpdateSchema } from './settings-schema';

const email = z.email().max(320).transform((s) => s.trim().toLowerCase());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// ---------------------------------------------------------------- auth
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(256),
});

export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(256)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use letters and at least one digit');

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1).max(120),
  password: passwordSchema,
});

// ---------------------------------------------------------------- users
export const ROLES = ['owner', 'agent'] as const;
export const userInviteSchema = z.object({
  email,
  name: z.string().trim().max(120).optional().default(''),
  role: z.enum(ROLES),
});
export const userUpdateSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('role'), role: z.enum(ROLES) }),
  z.object({ action: z.literal('deactivate') }),
  z.object({ action: z.literal('activate') }),
  z.object({ action: z.literal('reset_password') }),
]);

// ---------------------------------------------------------------- FAQ
const tags = z
  .union([z.string(), z.array(z.string())])
  .transform((t) => (Array.isArray(t) ? t : t.split(',')).map((x) => x.trim().toLowerCase()).filter(Boolean))
  .pipe(z.array(z.string().max(60)).max(30))
  .transform((t) => [...new Set(t)].join(','));

export const faqUpsertSchema = z.object({
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(3).max(5000),
  tags,
  active: z.boolean().default(true),
});
export const faqPatchSchema = faqUpsertSchema.partial().refine((o) => Object.keys(o).length > 0, 'Nothing to update');
export const faqCreateSchema = z.union([
  faqUpsertSchema,
  z.object({ duplicateOf: z.number().int().positive() }),
]);
export const faqImportSchema = z.object({
  format: z.enum(['csv', 'markdown']),
  content: z.string().min(1).max(1_000_000),
  skipDuplicates: z.boolean().default(true),
});

// ---------------------------------------------------------------- prompts
export const promptIdSchema = z.enum(PROMPT_IDS);
export const promptSaveSchema = z.object({
  body: z.string().min(1).max(30000),
  note: z.string().trim().max(200).optional().default(''),
  expectedVersion: z.number().int().positive(),
});
export const promptRestoreSchema = z.object({ version: z.number().int().positive() });
export const promptTestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  channel: z.enum(['email', 'chat']),
  customerName: z.string().trim().max(120).optional().default(''),
  overrides: z
    .object({ claude_system: z.string().max(30000).optional(), gemini_reviewer: z.string().max(30000).optional() })
    .optional()
    .default({}),
});

// ---------------------------------------------------------------- conversations
export const CONVERSATION_STATUSES = ['auto_replied', 'escalated', 'open', 'resolved'] as const;
export const conversationFilterSchema = z.object({
  channel: z.enum(['email', 'chat']).optional().catch(undefined),
  status: z.enum(CONVERSATION_STATUSES).optional().catch(undefined),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  q: z.string().trim().max(200).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).catch(1).default(1),
});
export const conversationActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), body: z.string().trim().min(1).max(10000), source: z.enum(['draft', 'edited', 'manual']) }),
  z.object({ action: z.literal('resolve') }),
  z.object({ action: z.literal('reopen') }),
  z.object({ action: z.literal('note'), body: z.string().trim().min(1).max(5000) }),
  z.object({ action: z.literal('assign'), userId: z.string().min(1).max(64).nullable() }),
]);

// ---------------------------------------------------------------- escalations
export const ESCALATION_STATUSES = ['open', 'in_progress', 'resolved'] as const;
export const PRIORITIES = ['high', 'normal', 'low'] as const;
export const REASON_CODES = [
  'low_confidence', 'models_disagree', 'unusual_question', 'parse_error', 'system_error',
  'kill_switch', 'outside_hours', 'blocked_keyword', 'policy', 'delivery_failed',
] as const;
export const escalationFilterSchema = z.object({
  status: z.enum(ESCALATION_STATUSES).optional().catch(undefined),
  priority: z.enum(PRIORITIES).optional().catch(undefined),
  reason: z.enum(REASON_CODES).optional().catch(undefined),
  assignee: z.string().max(64).optional().catch(undefined),
});
export const escalationBulkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('resolve'), ids: z.array(z.number().int().positive()).min(1).max(200) }),
  z.object({ action: z.literal('assign'), ids: z.array(z.number().int().positive()).min(1).max(200), assigneeId: z.string().min(1).max(64).nullable() }),
  z.object({ action: z.literal('status'), ids: z.array(z.number().int().positive()).min(1).max(200), status: z.enum(ESCALATION_STATUSES) }),
  z.object({ action: z.literal('priority'), ids: z.array(z.number().int().positive()).min(1).max(200), priority: z.enum(PRIORITIES) }),
]);

// ---------------------------------------------------------------- integrations
export const SERVICES = ['turso', 'oracle', 'anthropic', 'google', 'slack', 'imap', 'smtp'] as const;
export type Service = (typeof SERVICES)[number];
export const SECRET_NAMES = ['anthropic_api_key', 'google_ai_api_key', 'slack_bot_token', 'oracle_ords_password', 'imap_password', 'smtp_password'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];
export const integrationSecretsSchema = z.object({
  secrets: z.partialRecord(z.enum(SECRET_NAMES), z.string().trim().min(4).max(4096)),
});
export const integrationTestSchema = z.object({ service: z.enum(SERVICES) });

// ---------------------------------------------------------------- data tools
export const exportQuerySchema = z.object({
  type: z.enum(['conversations', 'escalations']),
  from: isoDate,
  to: isoDate,
});
export const deleteCustomerSchema = z
  .object({ email, confirmEmail: email })
  .refine((o) => o.email === o.confirmEmail, { message: 'The two email addresses do not match', path: ['confirmEmail'] });
export const retentionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('preview'), days: z.number().int().min(7).max(3650).nullable() }),
  z.object({ mode: z.literal('apply'), days: z.number().int().min(7).max(3650).nullable(), confirm: z.literal('DELETE') }),
]);

export const auditFilterSchema = z.object({
  actor: z.string().max(64).optional().catch(undefined),
  entity: z.string().max(40).optional().catch(undefined),
  action: z.string().max(60).optional().catch(undefined),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).catch(1).default(1),
});

// ---------------------------------------------------------------- internal API (called by n8n)
const modelJson = z.record(z.string(), z.unknown()).nullable().optional();
const internalBase = z.object({
  requestId: z.string().min(8).max(100),
  conversation: z.object({
    id: z.string().min(3).max(300),
    channel: z.enum(['email', 'chat']),
    customerEmail: z.email().max(320).nullable(),
    customerName: z.string().max(120).nullable().optional(),
    oracleCustomerId: z.string().max(64).nullable().optional(),
    subject: z.string().max(300).nullable().optional(),
  }),
  customerMessage: z.object({ body: z.string().max(20000), receivedAt: z.iso.datetime() }),
  reply: z.object({ text: z.string().min(1).max(20000), html: z.string().max(60000).optional().default('') }),
  deliver: z.boolean(),
  email: z
    .object({
      to: z.email().max(320),
      subject: z.string().max(300),
      inReplyTo: z.string().max(998).nullable().optional(),
      references: z.array(z.string().max(998)).max(50).optional().default([]),
      quotedText: z.string().max(20000).optional().default(''),
      quotedHtml: z.string().max(60000).optional().default(''),
    })
    .nullable()
    .optional(),
  decision: z.object({
    claude: modelJson,
    gemini: modelJson,
    threshold: z.number().min(0).max(1).nullable().optional(),
    bothValid: z.boolean(),
    geminiAgrees: z.boolean(),
    anyNeedsHuman: z.boolean(),
    forceHuman: z.boolean(),
    reasons: z.array(z.string().max(500)).max(30).optional().default([]),
    reasonCode: z.enum(REASON_CODES).nullable().optional(),
  }),
  account: z.record(z.string(), z.unknown()).nullable().optional(),
  meta: z.record(z.string(), z.unknown()).optional().default({}),
});
export const internalSendReplySchema = internalBase;
export const internalEscalateSchema = internalBase.extend({
  escalation: z.object({
    reasonCode: z.enum(REASON_CODES),
    reason: z.string().max(2000),
    priority: z.enum(PRIORITIES).optional(),
    notifySlack: z.boolean().default(true),
  }),
});
export type InternalSendReply = z.infer<typeof internalSendReplySchema>;
export type InternalEscalate = z.infer<typeof internalEscalateSchema>;
