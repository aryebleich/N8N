import { z } from 'zod';
import { PROMPT_IDS } from './prompt-template';
import { NEVER_RULE_IDS, TONE_STYLES } from './settings-schema';

export { settingsUpdateSchema } from './settings-schema';

const keywords = z
  .union([z.string(), z.array(z.string())])
  .transform((t) => (Array.isArray(t) ? t : t.split(',')).map((x) => x.trim().toLowerCase()).filter(Boolean))
  .pipe(z.array(z.string().max(60)).max(30))
  .transform((t) => [...new Set(t)].join(','));

export const answerSchema = z.object({
  question: z.string().trim().min(3, 'Write a question of at least 3 characters.').max(500),
  answer: z.string().trim().min(3, 'Write a reply of at least 3 characters.').max(5000),
  tags: keywords.default(''),
  active: z.boolean().default(true),
});
export const answerPatchSchema = answerSchema.partial().refine((o) => Object.keys(o).length > 0, 'Nothing to save');
export const answerRestoreSchema = z.object({ auditId: z.number().int().positive(), which: z.enum(['before', 'after']) });
export const importSchema = z.object({ mode: z.enum(['preview', 'import']), content: z.string().min(1).max(1_000_000) });

export const toneSchema = z.object({
  tone_style: z.enum(TONE_STYLES),
  tone_custom: z.string().max(1000).default(''),
  never_rules: z.array(z.enum(NEVER_RULE_IDS)).default([]),
  never_custom: z.string().max(2000).default(''),
  company_name: z.string().trim().min(1, 'Enter your company name.').max(120),
  email_signature: z.string().trim().min(1).max(1000),
  chat_greeting: z.string().trim().min(1).max(500),
  holding_message: z.string().trim().min(1).max(2000),
});
export const promptIdSchema = z.enum(PROMPT_IDS);
export const promptSaveSchema = z.object({ body: z.string().min(1).max(30000) });
export const promptRestoreSchema = z.object({ version: z.number().int().positive() });

export const testSchema = z.object({
  message: z.string().trim().min(1, 'Type a question first.').max(4000),
  channel: z.enum(['email', 'chat']),
  live: z.boolean().default(false),
  liveEmail: z.union([z.literal(''), z.email()]).optional().default(''),
});

export const conversationActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), body: z.string().trim().min(1).max(10000), source: z.enum(['draft', 'edited', 'manual']) }),
  z.object({ action: z.literal('done') }),
  z.object({ action: z.literal('reopen') }),
]);
export const conversationFilterSchema = z.object({
  channel: z.enum(['email', 'chat']).optional().catch(undefined),
  status: z.enum(['auto', 'waiting', 'done']).optional().catch(undefined),
  q: z.string().trim().max(200).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).catch(1).default(1),
});

export const wizardSchema = z.object({ step: z.enum(['company', 'hours', 'answers', 'finish']), data: z.record(z.string(), z.unknown()).default({}) });

// ---------------------------------------------------------------- internal API (n8n)
export const REASON_CODES = ['low_confidence', 'models_disagree', 'unusual_question', 'parse_error', 'system_error', 'kill_switch', 'outside_hours', 'blocked_keyword', 'policy', 'delivery_failed'] as const;
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
  email: z.object({
    to: z.email().max(320),
    subject: z.string().max(300),
    inReplyTo: z.string().max(998).nullable().optional(),
    references: z.array(z.string().max(998)).max(50).optional().default([]),
    quotedText: z.string().max(20000).optional().default(''),
    quotedHtml: z.string().max(60000).optional().default(''),
  }).nullable().optional(),
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
  escalation: z.object({ reasonCode: z.enum(REASON_CODES), reason: z.string().max(2000), priority: z.enum(['high', 'normal', 'low']).optional(), notifySlack: z.boolean().default(true) }),
});
export type InternalSendReply = z.infer<typeof internalSendReplySchema>;
export type InternalEscalate = z.infer<typeof internalEscalateSchema>;
