/** Masking helpers. Applied on the server before any customer text reaches the browser or Slack. */

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const [user, domain = ''] = String(email).toLowerCase().split('@');
  if (!domain) return `${user.slice(0, 1)}***`;
  const parts = domain.split('.');
  const tld = parts.length > 1 ? parts.pop() : '';
  return `${user.slice(0, 1)}***@${(parts.join('.') || '').slice(0, 1)}***${tld ? `.${tld}` : ''}`;
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/g;
const CVV_RE = /\b(cvv|cvc|security code)\s*[:#]?\s*\d{3,4}\b/gi;
const EXPIRY_RE = /\b(exp(?:iry|iration)?(?: date)?)\s*[:#]?\s*(0[1-9]|1[0-2])\s*\/\s*\d{2,4}\b/gi;

/** Removes card numbers (Luhn-valid 13-19 digits), CVV and expiry mentions. */
export function scrubPayment(text: string): string {
  return String(text ?? '')
    .replace(CARD_RE, (m) => (luhn(m.replace(/\D/g, '')) ? '[card number removed]' : m))
    .replace(CVV_RE, '$1 [removed]')
    .replace(EXPIRY_RE, '$1 [removed]');
}

/** Masks every email address except `keep` (the verified customer's own address, if any). */
export function maskEmails(text: string, keep?: string | null): string {
  const k = keep ? keep.toLowerCase() : null;
  return String(text ?? '').replace(EMAIL_RE, (e) => (k && e.toLowerCase() === k ? e : maskEmail(e)));
}

/** Text safe to display: payment data removed and email addresses masked. */
export function safeCustomerText(text: string | null | undefined, keepEmail?: string | null): string {
  return maskEmails(scrubPayment(String(text ?? '')), keepEmail);
}

const PAYMENT_KEY = /card|cvv|cvc|iban|bic|swift|payment|token|billing|account_number|routing|expir/i;

/** Deep-removes payment-like keys and scrubs string values. Used on stored Oracle summaries. */
export function scrubObject<T>(value: T): T {
  if (Array.isArray(value)) return value.map(scrubObject) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PAYMENT_KEY.test(k) || k === 'links') continue;
      out[k] = scrubObject(v);
    }
    return out as T;
  }
  return (typeof value === 'string' ? scrubPayment(value) : value) as T;
}
