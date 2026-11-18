import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { db, get, all, run } from '@/lib/db';
import { migrate } from '../../scripts/migrate';
import { ingest } from '@/lib/ingest';
import { getSettings, updateSettings } from '@/lib/settings';
import { savePrompt, getPrompt, restorePrompt } from '@/lib/prompts';
import { dashboardStats, decisionSamples } from '@/lib/metrics';
import { bulkUpdateEscalations, listEscalations } from '@/lib/escalations';
import { deleteCustomerData } from '@/lib/data';
import { saveSecrets, getSecret, listSecretInfo } from '@/lib/secrets';
import { retrieveFaq } from '@/lib/faq';

const actor = { id: 'usr_test', email: 'owner@example.com' };

const payload = (over: Record<string, unknown> = {}) => ({
  requestId: `req-${Math.random().toString(36).slice(2, 12)}`,
  conversation: { id: 'chat:0000000000000000aaaa', channel: 'chat' as const, customerEmail: 'ada@example.com', customerName: 'Ada Okafor', subject: 'Website chat' },
  customerMessage: { body: 'How long does shipping take? card 4111111111111111', receivedAt: new Date(Date.now() - 1500).toISOString() },
  reply: { text: 'Standard shipping takes 3 to 5 business days.', html: '' },
  deliver: false,
  email: null,
  decision: { claude: { answer: 'Standard shipping takes 3 to 5 business days.', confidence: 0.93, needs_human: false, reason: 'FAQ #1', uses_account_data: false }, gemini: { agrees: true, confidence: 0.9, issues: [], needs_human: false }, threshold: 0.8, bothValid: true, geminiAgrees: true, anyNeedsHuman: false, forceHuman: false, reasons: [], reasonCode: null },
  account: { full_name: 'Ada Okafor', plan: 'plus', status: 'active', card_last4: '1111', orders: [{ order_id: 'NW-1', status: 'shipped', payment_token: 'tok' }] },
  meta: { identity: { verified: true }, account_lookup: 'ok' },
  ...over,
});

beforeAll(async () => {
  await migrate(db(), path.join(__dirname, '../../migrations'), () => undefined);
  await db().executeMultiple(require('node:fs').readFileSync(path.join(__dirname, '../../n8n/turso/seed-faq.sql'), 'utf8'));
  await run("INSERT INTO users (id, email, name, password_hash, role, active, created_at, updated_at) VALUES ('usr_test', 'owner@example.com', 'Owner', 'x', 'owner', 1, '2026-01-01', '2026-01-01')");
});

describe('migrations', () => {
  it('are idempotent and seed defaults', async () => {
    await migrate(db(), path.join(__dirname, '../../migrations'), () => undefined);
    const names = (await all<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name')).map((r) => r.name);
    expect(names).toHaveLength(8);
    expect((await getSettings()).confidence_threshold).toBe(0.8);
    expect((await getPrompt('claude_system'))?.body).toContain('{{faq_context}}');
    const cols = (await all<{ name: string }>('PRAGMA table_info(escalations)')).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['status', 'priority', 'assignee_id', 'sla_due_at', 'reason_code']));
  });
  it('make the audit log append-only', async () => {
    await run("INSERT INTO audit_log (actor_id, action, entity, created_at) VALUES ('x', 't', 't', '2026')");
    await expect(run('UPDATE audit_log SET action = ?', ['y'])).rejects.toThrow(/append-only/);
    await expect(run('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
  });
});

describe('n8n ingest', () => {
  it('records an auto reply, scrubs account data and is idempotent', async () => {
    const p = payload();
    const r1 = await ingest(p, 'reply');
    expect(r1.escalationId).toBeNull();
    const r2 = await ingest(p, 'reply');
    expect(r2.duplicate).toBe(true);
    const msgs = await all<{ role: string }>('SELECT role FROM messages WHERE conversation_id = ?', [p.conversation.id]);
    expect(msgs.map((m) => m.role)).toEqual(['customer', 'assistant']);
    const d = await get<{ account_json: string; outcome: string }>('SELECT account_json, outcome FROM ai_decisions WHERE request_id = ?', [p.requestId]);
    expect(d?.outcome).toBe('auto');
    expect(d?.account_json).not.toMatch(/card_last4|payment_token/);
    expect((await get<{ status: string }>('SELECT status FROM conversations WHERE id = ?', [p.conversation.id]))?.status).toBe('auto_replied');
  });

  it('creates an escalation with reason code, priority and SLA', async () => {
    const p = payload({ conversation: { id: 'email:<x-1@example.com>', channel: 'email', customerEmail: 'sam@example.org', customerName: 'Sam', subject: 'Odd question' }, decision: { ...payload().decision, geminiAgrees: false, anyNeedsHuman: true, claude: { answer: 'A teammate will check.', confidence: 0.3, needs_human: true, reason: 'Not covered', uses_account_data: false }, gemini: { agrees: false, confidence: 0.2, issues: ['Not in KB'], needs_human: true } } });
    const r = await ingest({ ...p, escalation: { reasonCode: 'unusual_question', reason: 'Not in the FAQ', notifySlack: true } }, 'escalate');
    expect(r.escalationId).toBeGreaterThan(0);
    const e = await get<{ status: string; priority: string; reason_code: string; sla_due_at: string; gemini_issues: string }>('SELECT * FROM escalations WHERE id = ?', [r.escalationId]);
    expect(e).toMatchObject({ status: 'open', priority: 'normal', reason_code: 'unusual_question' });
    expect(new Date(e!.sla_due_at).getTime()).toBeGreaterThan(Date.now());
    const list = await listEscalations({});
    expect(list.find((x) => x.id === r.escalationId)?.customer).toBe('s***@e***.org');
    await bulkUpdateEscalations({ action: 'resolve', ids: [r.escalationId!] }, actor);
    expect((await get<{ status: string }>('SELECT status FROM escalations WHERE id = ?', [r.escalationId]))?.status).toBe('resolved');
  });

  it('feeds the dashboard and threshold preview', async () => {
    const s = await dashboardStats();
    expect(s.last24h.received).toBeGreaterThanOrEqual(2);
    expect(s.last24h.autoReplied).toBeGreaterThanOrEqual(1);
    expect(s.last24h.escalated).toBeGreaterThanOrEqual(1);
    expect(s.last24h.medianResponseMs).not.toBeNull();
    expect((await decisionSamples()).length).toBeGreaterThanOrEqual(2);
  });
});

describe('settings, prompts, secrets, data', () => {
  it('audits settings changes, including the kill switch', async () => {
    await updateSettings({ auto_reply_email: false, confidence_threshold: 0.6 }, actor);
    expect((await getSettings()).auto_reply_email).toBe(false);
    const a = await all<{ action: string }>("SELECT action FROM audit_log WHERE entity = 'settings' ORDER BY id");
    expect(a.map((x) => x.action)).toEqual(expect.arrayContaining(['settings.kill_switch', 'settings.update']));
  });
  it('versions prompts with optimistic locking and restore', async () => {
    const p = await getPrompt('chat_greeting');
    await savePrompt('chat_greeting', 'Hello from {{company_name}}!', 'test', p!.version, actor);
    await expect(savePrompt('chat_greeting', 'Stale edit {{company_name}}', '', p!.version, actor)).rejects.toThrow(/saved version/);
    await expect(savePrompt('chat_greeting', 'Bad {{customer_name}}', '', p!.version + 1, actor)).rejects.toThrow(/errors/);
    await restorePrompt('chat_greeting', 1, actor);
    const now = await getPrompt('chat_greeting');
    expect(now?.version).toBe(p!.version + 2);
    expect(now?.body).toBe(p!.body);
  });
  it('stores secrets encrypted and only exposes last4', async () => {
    await saveSecrets({ slack_bot_token: 'xoxb-test-token-9876' }, actor);
    const raw = await get<{ ciphertext: string }>("SELECT ciphertext FROM api_keys WHERE name = 'slack_bot_token'");
    expect(raw?.ciphertext).not.toContain('xoxb');
    expect(await getSecret('slack_bot_token')).toBe('xoxb-test-token-9876');
    expect((await listSecretInfo()).find((s) => s.name === 'slack_bot_token')).toMatchObject({ last4: '9876', source: 'database' });
    const audit = await all<{ new_json: string }>("SELECT new_json FROM audit_log WHERE action = 'api_key.update'");
    expect(JSON.stringify(audit)).not.toContain('xoxb-test');
  });
  it('retrieves FAQ rows with FTS5', async () => {
    const r = await retrieveFaq('How long does shipping take?');
    expect(r.method).toBe('fts5');
    expect(r.rows[0].id).toBe(1);
  });
  it('deletes one customer and leaves others', async () => {
    const out = await deleteCustomerData('ADA@example.com', actor);
    expect(out.conversations).toBe(1);
    expect(await get("SELECT 1 FROM conversations WHERE customer_email = 'ada@example.com'")).toBeUndefined();
    expect(await get("SELECT 1 FROM conversations WHERE customer_email = 'sam@example.org'")).toBeDefined();
  });
});
