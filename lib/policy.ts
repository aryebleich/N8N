import { levelFor, type Settings } from './settings-schema';

/**
 * The same decision rules as the n8n "Policy Guard" node, as a pure function, so the
 * Test Center gives the answer the real workflow would give.
 */
export interface ModelVerdict {
  valid: boolean;
  confidence: number;
  needs_human: boolean;
  answer?: string;
  reason?: string;
  uses_account_data?: boolean;
  agrees?: boolean;
  issues?: string[];
  error?: string | null;
}

export type ReasonCode =
  | 'low_confidence' | 'models_disagree' | 'unusual_question' | 'parse_error' | 'system_error'
  | 'kill_switch' | 'outside_hours' | 'blocked_keyword' | 'policy' | 'delivery_failed';

export interface Decision {
  auto: boolean;
  threshold: number;
  reasonCode: ReasonCode | null;
  reasons: string[];
  forced: { code: ReasonCode; text: string }[];
}

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};

export function isOutsideHours(bh: Settings['business_hours'], now = new Date()): boolean {
  if (!bh.enabled) return false;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: bh.timezone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]),
    );
    const day = String(parts.weekday || '').slice(0, 3).toLowerCase() as keyof typeof bh.days;
    const hhmm = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    const hours = bh.days[day];
    return !hours || hhmm < hours[0] || hhmm >= hours[1];
  } catch {
    return false;
  }
}

export function decide(input: {
  settings: Settings;
  channel: 'email' | 'chat';
  message: string;
  subject?: string;
  customerEmail?: string | null;
  claude: ModelVerdict;
  gemini: ModelVerdict;
  now?: Date;
}): Decision {
  const { settings: s, channel, claude, gemini } = input;
  const T = levelFor(s, channel);
  const answer = String(claude.answer || '');
  const cardLike = (answer.match(/\b\d(?:[ -]?\d){12,18}\b/g) || []).some((m) => luhn(m.replace(/\D/g, '')));
  const allowed = new Set([String(input.customerEmail || '').toLowerCase(), s.support_from_email.toLowerCase()]);
  const foreignEmail = (answer.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).some((e) => !allowed.has(e.toLowerCase()));
  const autoOn = s.assistant_enabled && (channel === 'email' ? s.auto_reply_email : s.auto_reply_chat);
  const text = `${input.subject || ''} ${input.message}`.toLowerCase();
  const keywordHit = s.blocked_keywords.find((k) => k && text.includes(k.toLowerCase()));

  const forced: Decision['forced'] = [];
  if (!autoOn) forced.push({ code: 'kill_switch', text: !s.assistant_enabled ? 'The assistant is switched off on the Home page' : `Automatic replies are turned off for ${channel}` });
  if (isOutsideHours(s.business_hours, input.now)) forced.push({ code: 'outside_hours', text: 'Received outside business hours' });
  if (keywordHit) forced.push({ code: 'blocked_keyword', text: `Message contains the blocked word "${keywordHit}"` });
  if (claude.uses_account_data) forced.push({ code: 'policy', text: 'Draft uses account data but the customer is not verified' });
  if (cardLike) forced.push({ code: 'policy', text: 'Draft contains a card-like number' });
  if (foreignEmail) forced.push({ code: 'policy', text: 'Draft mentions an email address other than the customer or support address' });

  const reasons: string[] = [];
  if (!claude.valid) reasons.push(`Claude response unusable: ${claude.error || 'invalid JSON'}`);
  if (!gemini.valid) reasons.push(`Gemini response unusable: ${gemini.error || 'invalid JSON'}`);
  if (claude.valid && claude.confidence < T) reasons.push(`Claude confidence ${claude.confidence.toFixed(2)} < ${T}`);
  if (gemini.valid && gemini.confidence < T) reasons.push(`Gemini confidence ${gemini.confidence.toFixed(2)} < ${T}`);
  if (gemini.valid && !gemini.agrees) reasons.push('Gemini does not agree with the draft');
  if (claude.valid && claude.needs_human) reasons.push(`Claude asked for a human: ${claude.reason || 'no reason given'}`);
  if (gemini.valid && gemini.needs_human) reasons.push('Gemini asked for a human');
  reasons.push(...forced.map((f) => f.text));

  let reasonCode: ReasonCode | null = null;
  if (!claude.valid || !gemini.valid) reasonCode = 'parse_error';
  else if (forced.length) reasonCode = forced[0].code;
  else if (claude.needs_human) reasonCode = 'unusual_question';
  else if (!gemini.agrees || gemini.needs_human) reasonCode = 'models_disagree';
  else if (claude.confidence < T || gemini.confidence < T) reasonCode = 'low_confidence';

  return { auto: reasonCode === null, threshold: T, reasonCode, reasons, forced };
}
