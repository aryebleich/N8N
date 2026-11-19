import { beforeAll, describe, expect, it } from 'vitest';
import { prepareDatabase } from '@/lib/startup';
import { ingest } from '@/lib/ingest';
import { getConversation, listConversations, setDone } from '@/lib/conversations';
import { latestNeedingPerson, recentDecisionSamples, todayNumbers } from '@/lib/metrics';
import { runTest } from '@/lib/assistant';
import { createAnswer, updateAnswer, restoreAnswer, deleteAnswer, answerHistory } from '@/lib/faq-admin';
import { getPrompt } from '@/lib/prompts';
import { saveTone, restoreTone } from '@/lib/tone-admin';
import { getSettings, updateSettings } from '@/lib/settings';
import { internalEscalateSchema } from '@/lib/validators';
import { ADMIN } from '@/lib/audit';
import { get } from '@/lib/db';

beforeAll(() => prepareDatabase());

const payload = (requestId: string, id: string) => internalEscalateSchema.parse({
  requestId,
  conversation: { id, channel: 'chat', customerEmail: null, customerName: 'Ada' },
  customerMessage: { body: 'Discount for 40 kettles?', receivedAt: new Date().toISOString() },
  reply: { text: 'A teammate will reply shortly.' },
  deliver: false,
  decision: { claude: { answer: 'Maybe 10%', confidence: 0.5, needs_human: true }, gemini: { agrees: false, confidence: 0.4, issues: ['Not in FAQ'], needs_human: true }, threshold: 0.8, bothValid: true, geminiAgrees: false, anyNeedsHuman: true, forceHuman: false, reasons: ['low'], reasonCode: 'unusual_question' },
  escalation: { reasonCode: 'unusual_question', reason: 'Claude asked for a person', notifySlack: true },
});

describe('n8n ingest and conversations', () => {
  it('stores an escalation once, even when n8n retries', async () => {
    const a = await ingest(payload('req-flow-0001', 'chat:aaaaaaaaaaaaaaaaaaaa'), 'escalate');
    const b = await ingest(payload('req-flow-0001', 'chat:aaaaaaaaaaaaaaaaaaaa'), 'escalate');
    expect(a.escalationId).toBeGreaterThan(0);
    expect(b).toMatchObject({ duplicate: true, escalationId: a.escalationId });
    expect((await get<{ n: number }>('SELECT count(*) AS n FROM escalations'))?.n).toBe(1);
  });
  it('shows it as waiting, with a plain Why and the draft', async () => {
    const c = await getConversation('chat:aaaaaaaaaaaaaaaaaaaa');
    expect(c).toMatchObject({ bucket: 'waiting', draft: 'Maybe 10%' });
    expect(c!.why!.title).toBe('Unusual question');
    expect((await latestNeedingPerson()).map((x) => x.id)).toContain('chat:aaaaaaaaaaaaaaaaaaaa');
    expect((await todayNumbers()).waiting).toBe(1);
    expect((await listConversations({ status: 'waiting', page: 1 })).total).toBe(1);
    expect((await recentDecisionSamples()).length).toBe(1);
  });
  it('marks as done', async () => {
    await setDone('chat:aaaaaaaaaaaaaaaaaaaa', true, ADMIN);
    expect((await getConversation('chat:aaaaaaaaaaaaaaaaaaaa'))!.bucket).toBe('done');
    expect((await get<{ status: string }>('SELECT status FROM escalations'))?.status).toBe('resolved');
  });
});

describe('Test Center without keys', () => {
  it('uses the simulator and finishes within 10 seconds', async () => {
    const r = await runTest({ message: 'How long does shipping take?', channel: 'chat', live: false });
    expect(r.engines).toEqual({ claude: 'simulator', gemini: 'simulator' });
    expect(r.decision.auto).toBe(true);
    expect(r.under10s).toBe(true);
    const blocked = await runTest({ message: 'My lawyer wants a refund', channel: 'email', live: false });
    expect(blocked.decision.reasonCode).toBe('blocked_keyword');
    expect(blocked.customerWouldGet).toMatch(/^Hi,/);
  });
});

describe('undo and history', () => {
  it('restores an answer to before a change and after a delete', async () => {
    const id = await createAnswer({ question: 'Do you gift wrap?', answer: 'Yes, for $3.', tags: 'gift', active: true }, ADMIN);
    const auditId = await updateAnswer(id, { answer: 'No.' }, ADMIN);
    await restoreAnswer(id, auditId, 'before', ADMIN);
    expect((await get<{ answer: string }>('SELECT answer FROM faq WHERE id = ?', [id]))?.answer).toBe('Yes, for $3.');
    await deleteAnswer(id, ADMIN);
    const del = (await answerHistory(id)).find((h) => h.action === 'faq.delete')!;
    await restoreAnswer(id, del.auditId, 'before', ADMIN);
    expect((await get<{ answer: string }>('SELECT answer FROM faq WHERE id = ?', [id]))?.answer).toBe('Yes, for $3.');
  });
  it('rebuilds instructions from the tone and undoes it', async () => {
    const before = await getPrompt('claude_system');
    const s = await getSettings(true);
    const snap = await saveTone({ tone_style: 'professional', tone_custom: '', never_rules: s.never_rules, never_custom: '', company_name: 'Acme', email_signature: 'Regards,\n{{company_name}}', chat_greeting: 'Hello', holding_message: 'We will reply soon.' }, ADMIN);
    const after = await getPrompt('claude_system');
    expect(after!.version).toBe(before!.version + 1);
    expect(after!.body).toContain('no exclamation marks');
    await restoreTone(snap, ADMIN);
    expect((await getSettings(true)).tone_style).toBe(s.tone_style);
    expect((await getPrompt('claude_system'))!.body).toBe(before!.body);
    await updateSettings({ company_name: s.company_name }, ADMIN);
  });
});
