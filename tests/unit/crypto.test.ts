import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, last4, safeEqual, sha256 } from '@/lib/crypto';

describe('AES-256-GCM helpers', () => {
  it('round-trips with a random IV and binds the AAD', () => {
    const a = encrypt('sk-ant-secret-value-1234', 'anthropic_api_key');
    const b = encrypt('sk-ant-secret-value-1234', 'anthropic_api_key');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toContain('secret');
    expect(decrypt(a, 'anthropic_api_key')).toBe('sk-ant-secret-value-1234');
    expect(() => decrypt(a, 'slack_bot_token')).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const s = encrypt('hello', 'x');
    const bytes = Buffer.from(s.ciphertext, 'base64');
    bytes[0] ^= 1;
    expect(() => decrypt({ ...s, ciphertext: bytes.toString('base64') }, 'x')).toThrow();
  });

  it('shows only the last 4 characters', () => {
    expect(last4('xoxb-123456789')).toBe('6789');
    expect(last4('abc')).toBe('••••');
  });

  it('compares in constant time and hashes deterministically', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(sha256('a')).toHaveLength(64);
  });
});
