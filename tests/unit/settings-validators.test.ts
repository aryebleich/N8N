import { describe, expect, it } from 'vitest';
import { settingsUpdateSchema, thresholdFor, DEFAULT_SETTINGS } from '@/lib/settings-schema';
import { conversationActionSchema, internalEscalateSchema, retentionSchema, deleteCustomerSchema } from '@/lib/validators';
import { previewAutoSend } from '@/lib/threshold-preview';

describe('settings validation', () => {
  it('accepts known keys and rejects unknown or out-of-range values', () => {
    expect(settingsUpdateSchema.safeParse({ confidence_threshold: 0.6 }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ confidence_threshold: 1.2 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ nope: 1 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ blocked_senders: ['@spam.com', 'x@y.co'] }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ blocked_senders: ['not an email'] }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ slack_channel_id: '#general' }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ business_hours: { ...DEFAULT_SETTINGS.business_hours, timezone: 'Mars/Olympus' } }).success).toBe(false);
  });
  it('per-channel thresholds override the default', () => {
    expect(thresholdFor({ confidence_threshold: 0.8, confidence_threshold_email: null, confidence_threshold_chat: 0.7 }, 'email')).toBe(0.8);
    expect(thresholdFor({ confidence_threshold: 0.8, confidence_threshold_email: null, confidence_threshold_chat: 0.7 }, 'chat')).toBe(0.7);
  });
});

describe('request validators', () => {
  it('conversation actions are a closed set', () => {
    expect(conversationActionSchema.safeParse({ action: 'send', body: 'hi', source: 'manual' }).success).toBe(true);
    expect(conversationActionSchema.safeParse({ action: 'delete' }).success).toBe(false);
  });
  it('retention apply needs the DELETE confirmation', () => {
    expect(retentionSchema.safeParse({ mode: 'apply', days: 30 }).success).toBe(false);
    expect(retentionSchema.safeParse({ mode: 'apply', days: 30, confirm: 'DELETE' }).success).toBe(true);
  });
  it('customer deletion needs matching emails', () => {
    expect(deleteCustomerSchema.safeParse({ email: 'A@x.com', confirmEmail: 'a@x.com' }).success).toBe(true);
    expect(deleteCustomerSchema.safeParse({ email: 'a@x.com', confirmEmail: 'b@x.com' }).success).toBe(false);
  });
  it('escalate payload requires a known reason code', () => {
    const base = {
      requestId: 'req-12345678', conversation: { id: 'chat:abc', channel: 'chat', customerEmail: 'a@b.co' },
      customerMessage: { body: 'hi', receivedAt: new Date().toISOString() }, reply: { text: 'Thanks' }, deliver: false,
      decision: { bothValid: true, geminiAgrees: false, anyNeedsHuman: true, forceHuman: false },
    };
    expect(internalEscalateSchema.safeParse({ ...base, escalation: { reasonCode: 'models_disagree', reason: 'x' } }).success).toBe(true);
    expect(internalEscalateSchema.safeParse({ ...base, escalation: { reasonCode: 'vibes', reason: 'x' } }).success).toBe(false);
  });
});

describe('threshold preview', () => {
  const s = (c: number, g: number, extra: Partial<{ valid: boolean; agrees: boolean; human: boolean; forced: boolean; channel: 'email' | 'chat' }> = {}) => ({ channel: 'email' as const, c, g, valid: true, agrees: true, human: false, forced: false, ...extra });
  it('counts what would auto-send at a threshold', () => {
    const samples = [s(0.95, 0.9), s(0.85, 0.82), s(0.7, 0.9), s(0.65, 0.62), s(0.9, 0.9, { agrees: false }), s(0.99, 0.99, { forced: true }), s(0.9, 0.9, { channel: 'chat' })];
    expect(previewAutoSend(samples, 0.8).wouldSend).toBe(3);
    expect(previewAutoSend(samples, 0.6).wouldSend).toBe(5);
    expect(previewAutoSend(samples, 0.6, 'chat')).toEqual({ total: 1, wouldSend: 1, share: 1 });
    expect(previewAutoSend([], 0.8).share).toBeNull();
  });
});
