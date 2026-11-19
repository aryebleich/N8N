import { CLAUDE_BASE_AFTER_TONE, CLAUDE_BASE_BEFORE_TONE } from './default-prompts';
import type { Settings } from './settings-schema';

/** The tone presets the owner picks from, in plain words. */
export const TONE_PRESETS: Record<'friendly' | 'professional' | 'short', { label: string; description: string; example: string; rules: string[] }> = {
  friendly: {
    label: 'Friendly',
    description: 'Warm and personal, like a helpful shop assistant.',
    example: 'Hi Ada, good news: standard shipping takes 3 to 5 business days, so your kettle should be with you by Friday.',
    rules: [
      "Warm, direct and personal. Use the customer's first name when you know it.",
      'Plain language. No jargon.',
    ],
  },
  professional: {
    label: 'Professional',
    description: 'Polite, precise and calm, like a bank or law firm.',
    example: 'Thank you for your message. Standard shipping takes 3 to 5 business days within the continental US.',
    rules: [
      'Polite, precise and calm. Full sentences, no slang, no exclamation marks.',
      'Address the customer by name when you know it.',
    ],
  },
  short: {
    label: 'Short and direct',
    description: 'Answer first, as few words as possible.',
    example: 'Standard shipping: 3 to 5 business days. Express: 1 to 2.',
    rules: ['Answer first. At most 3 short sentences. No small talk.', 'Plain language.'],
  },
};

/** "Things the assistant must never do": the checkbox list. */
export const NEVER_RULES: Record<string, { label: string; instruction: string }> = {
  promise_money: { label: 'Promise refunds, discounts or compensation that are not in your answers', instruction: 'Promise refunds, discounts, compensation or exceptions that are not written in the knowledge base.' },
  share_other_customers: { label: "Share another customer's details", instruction: 'Mention or reveal any information about a customer other than the one you are talking to.' },
  payment_details: { label: 'Ask for or repeat card numbers or passwords', instruction: 'Ask for, repeat or confirm card numbers, security codes, bank details or passwords.' },
  legal_medical_advice: { label: 'Give legal, medical or financial advice', instruction: 'Give legal, medical, tax or financial advice. Suggest the customer asks a professional.' },
  competitors: { label: 'Talk about competitors', instruction: 'Recommend, compare or comment on competitors.' },
  guess_dates: { label: 'Guess delivery dates', instruction: 'Guess delivery dates or times that are not in the knowledge base or the customer context.' },
  emoji: { label: 'Use emoji', instruction: 'Use emoji or exclamation marks.' },
};

type ToneInput = Pick<Settings, 'tone_style' | 'tone_custom' | 'never_rules' | 'never_custom'>;

/** Builds the Claude instructions from the owner's tone choices (the "recommended" text). */
export function buildClaudeSystem(t: ToneInput): string {
  const style =
    t.tone_style === 'custom'
      ? (t.tone_custom.trim() || 'Warm, direct and brief.').split('\n').map((l) => l.trim()).filter(Boolean)
      : TONE_PRESETS[t.tone_style].rules;
  const toneLines = [
    ...style,
    'Email: 2 to 6 short paragraphs. Do not add a greeting line like "Dear X" or a signature; the workflow adds both.',
    'Chat: 1 to 4 short sentences, or a short Markdown list when steps help.',
    'Never promise anything the knowledge base or customer context does not support: no refunds, discounts, delivery dates, exceptions or policy changes that are not written below.',
  ];
  const never = [
    ...t.never_rules.map((id) => NEVER_RULES[id]?.instruction).filter(Boolean),
    ...t.never_custom.split('\n').map((l) => l.trim().replace(/^[-*•]\s*/, '')).filter(Boolean),
  ];
  const neverBlock = never.length ? `\n# Never do these things\n${never.map((n) => `- ${n}`).join('\n')}\nIf the customer asks for one of these, explain kindly that a teammate will help, and set needs_human to true.\n` : '';
  return `${CLAUDE_BASE_BEFORE_TONE}\n\n# Tone\n${toneLines.map((l) => `- ${l}`).join('\n')}\n${neverBlock}\n${CLAUDE_BASE_AFTER_TONE}`;
}
