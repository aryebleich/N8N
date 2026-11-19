import { adminRoute } from '@/lib/api';
import { updateSettings } from '@/lib/settings';
import { saveTone } from '@/lib/tone-admin';
import { getPromptBodies } from '@/lib/prompts';
import { getSettings } from '@/lib/settings';
import { SETTINGS_SCHEMA } from '@/lib/settings-schema';
import { wizardSchema } from '@/lib/validators';
import { HttpError } from '@/lib/errors';

/** First-visit wizard. Each step saves as soon as you press Next. */
export const POST = adminRoute(wizardSchema, async ({ body, actor }) => {
  const d = body.data;
  if (body.step === 'company') {
    const name = SETTINGS_SCHEMA.company_name.safeParse(d.company_name);
    if (!name.success) throw new HttpError(400, 'Type your company name.');
    const email = SETTINGS_SCHEMA.support_from_email.safeParse(d.support_from_email ?? '');
    if (!email.success) throw new HttpError(400, 'That support email address does not look right.');
    const s = await getSettings(true);
    const p = await getPromptBodies();
    await saveTone({ tone_style: s.tone_style, tone_custom: s.tone_custom, never_rules: s.never_rules, never_custom: s.never_custom, company_name: name.data, email_signature: p.email_signature, chat_greeting: p.chat_greeting, holding_message: p.holding_message }, actor);
    await updateSettings({ support_from_email: email.data }, actor);
  } else if (body.step === 'hours') {
    const bh = SETTINGS_SCHEMA.business_hours.safeParse(d.business_hours);
    if (!bh.success) throw new HttpError(400, bh.error.issues.map((i) => i.message).join(' '));
    await updateSettings({ business_hours: bh.data }, actor);
  } else if (body.step === 'finish') {
    await updateSettings({ setup_complete: true }, actor);
  }
  return { ok: true };
});
