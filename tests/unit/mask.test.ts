import { describe, expect, it } from 'vitest';
import { maskEmail, maskEmails, safeCustomerText, scrubObject, scrubPayment } from '@/lib/mask';
import { formatEscalationForSlack } from '@/lib/slack-format';

describe('masking', () => {
  it('masks emails', () => {
    expect(maskEmail('ada.okafor@example.com')).toBe('a***@e***.com');
    expect(maskEmails('mail bob@contoso.com and ada@x.io', 'ada@x.io')).toBe('mail b***@c***.com and ada@x.io');
  });
  it('removes Luhn-valid card numbers, CVV and expiry but keeps tracking numbers', () => {
    const t = scrubPayment('Card 4111 1111 1111 1111, cvv 123, exp 08/28. Tracking 9400111899223197428490. Order 1234567890123.');
    expect(t).not.toMatch(/4111/);
    expect(t).toMatch(/cvv \[removed\]/);
    expect(t).toMatch(/exp \[removed\]/);
    expect(t).toMatch(/9400111899223197428490/);
    expect(t).toMatch(/1234567890123/);
  });
  it('drops payment-like keys deeply', () => {
    expect(scrubObject({ full_name: 'Ada', card_last4: '1111', orders: [{ id: 1, payment_token: 'tok', total: 5 }] })).toEqual({ full_name: 'Ada', orders: [{ id: 1, total: 5 }] });
  });
  it('safeCustomerText combines both', () => {
    expect(safeCustomerText('x@y.com 5555555555554444')).toBe('x***@y***.com [card number removed]');
  });
  it('Slack summary shows only the verified customer email', () => {
    const base = {
      id: 7, channel: 'email' as const, conversationId: 'email:<a@b>', customerName: 'Ada Okafor', customerEmail: 'ada@example.com', accountLookup: 'ok',
      reasonCode: 'unusual_question', reason: 'Not in FAQ', priority: 'normal', claudeConfidence: 0.3, geminiConfidence: 0.2, geminiAgrees: false,
      geminiIssues: ['Mentions bob@contoso.com'], customerMessage: 'Ask bob@contoso.com, card 4111111111111111', claudeDraft: null,
      receivedAt: '2026-11-18T10:00:00.000Z', slaDueAt: null, link: 'https://admin/x',
    };
    const verified = formatEscalationForSlack({ ...base, verified: true });
    expect(verified).toContain('<ada@example.com>');
    expect(verified).toContain('b***@c***.com');
    expect(verified).not.toContain('4111111111111111');
    expect(formatEscalationForSlack({ ...base, verified: false })).toContain('<a***@e***.com>');
  });
});
