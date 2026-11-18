import { describe, expect, it } from 'vitest';
import { extractVariables, renderTemplate, tokenizeTemplate, validateTemplate } from '@/lib/prompt-template';

describe('prompt templates', () => {
  it('extracts and renders {{variables}}', () => {
    expect(extractVariables('Hi {{ customer_name }} from {{company_name}}')).toEqual(['customer_name', 'company_name']);
    expect(renderTemplate('Hi {{customer_name}}, {{unknown}}', { customer_name: 'Ada' })).toBe('Hi Ada, {{unknown}}');
  });

  it('rejects unknown variables and missing required ones', () => {
    const r = validateTemplate('claude_system', 'You work for {{company_name}}. {{secret_sauce}}');
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/secret_sauce/);
    expect(r.errors.join(' ')).toMatch(/faq_context.*required/);
  });

  it('accepts a valid Claude prompt and warns about missing needs_human', () => {
    const r = validateTemplate('claude_system', 'Company {{company_name}}. KB: {{faq_context}}');
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/needs_human/);
  });

  it('flags variables not allowed in a given prompt', () => {
    expect(validateTemplate('email_signature', 'Regards, {{customer_name}}').ok).toBe(false);
    expect(validateTemplate('email_signature', 'Regards, {{company_name}}').ok).toBe(true);
  });

  it('catches unbalanced braces and bad names', () => {
    expect(validateTemplate('chat_greeting', 'Hi {{company_name}').ok).toBe(false);
    expect(validateTemplate('chat_greeting', 'Hi {{Company-Name}}').ok).toBe(false);
  });

  it('tokenizes for highlighting', () => {
    const t = tokenizeTemplate('holding_message', 'Thanks {{first_name}} {{faq_context}}');
    expect(t.filter((x) => x.variable).map((x) => [x.variable!.name, x.variable!.valid])).toEqual([['first_name', true], ['faq_context', false]]);
  });
});
