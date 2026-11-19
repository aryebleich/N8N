import { z } from 'zod';
import { adminRoute } from '@/lib/api';
import { restoreTone } from '@/lib/tone-admin';
import { NEVER_RULE_IDS, TONE_STYLES } from '@/lib/settings-schema';
import { PROMPT_IDS } from '@/lib/prompt-template';

const snapshot = z.object({
  settings: z.object({
    tone_style: z.enum(TONE_STYLES), tone_custom: z.string().max(1000), never_rules: z.array(z.enum(NEVER_RULE_IDS)),
    never_custom: z.string().max(2000), company_name: z.string().min(1).max(120), prompt_mode: z.enum(['recommended', 'custom']),
  }),
  versions: z.partialRecord(z.enum(PROMPT_IDS), z.number().int().positive()),
});

export const POST = adminRoute(snapshot, async ({ body, actor }) => { await restoreTone(body, actor); return { ok: true }; });
