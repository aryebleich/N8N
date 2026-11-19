import { expect, test, type Page } from '@playwright/test';

/** The owner test checklist from the README, run in a real browser on a fresh database. */
test.describe.configure({ mode: 'serial' });

const SECRET = 'e2e-internal-secret-0123456789';

async function finishWizard(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/wizard/);
  await page.fill('#w-company', 'Acme Kettles');
  await page.getByTestId('wizard-next').click();
  await expect(page.getByText('When are you open?')).toBeVisible();
  await page.getByTestId('wizard-next').click();
  await expect(page.getByText('Start with sample answers?')).toBeVisible();
  await page.getByTestId('wizard-next').click();
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByTestId('wizard-result')).toContainText('answer automatically');
  await page.getByTestId('wizard-finish').click();
  await expect(page).toHaveURL(/\/$/);
}

test('1. first visit opens the 4-step wizard and lands on Home', async ({ page }) => {
  await finishWizard(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText('Acme Kettles').first()).toBeVisible();
  for (const item of ['Home', 'Conversations', 'Answers (FAQ)', 'Tone and Rules', 'Settings', 'Test Center']) {
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: item })).toBeVisible();
  }
  await expect(page.getByTestId('service-status')).toContainText('Database');
  await expect(page.getByTestId('service-status')).not.toContainText('sk-ant');
});

test('2. the big switch turns the assistant off (after asking) and on', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('assistant-toggle').click();
  await expect(page.getByRole('dialog')).toContainText('Are you sure?');
  await page.getByRole('button', { name: 'Yes, turn it off' }).click();
  await expect(page.getByTestId('assistant-toggle')).toContainText('The assistant is OFF');
  await page.getByTestId('assistant-toggle').click();
  await expect(page.getByTestId('assistant-toggle')).toContainText('The assistant is ON');
});

test('3. add an answer, then undo it', async ({ page }) => {
  await page.goto('/answers?new=1');
  await page.fill('#f-q', 'Do you offer gift wrapping?');
  await page.fill('#f-a', 'Yes, gift wrapping costs $3 per item.');
  await expect(page.getByRole('dialog')).toContainText('Yes, gift wrapping costs $3 per item.');
  await page.getByRole('button', { name: 'Save answer' }).click();
  await expect(page.getByTestId('answer-list')).toContainText('Do you offer gift wrapping?');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Undone.')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('answer-list')).not.toContainText('Do you offer gift wrapping?');
});

test('4. CSV import shows a preview first', async ({ page }) => {
  await page.goto('/answers');
  await page.getByRole('button', { name: 'Import a spreadsheet' }).click();
  await page.getByTestId('csv-input').setInputFiles({ name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from('question,reply,keywords,use_this_answer\nDo you sell gift cards?,Yes from $10.,gift card,yes\nBad row,,,\n') });
  await expect(page.getByText('Preview: 1 ready to import, 1 with a problem')).toBeVisible();
  await page.getByRole('button', { name: 'Import 1 answers' }).click();
  await expect(page.getByTestId('answer-list')).toContainText('Do you sell gift cards?');
});

test('5. the confidence slider shows a live note and saves', async ({ page }) => {
  await page.goto('/settings');
  const note = page.getByTestId('main-note');
  const before = await note.textContent();
  await page.getByTestId('main-slider').getByRole('slider').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(note).not.toHaveText(before!);
  await page.getByTestId('save-settings').click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await expect(page.getByTestId('widget-code')).toContainText('data-site-url');
});

test('6. tone change saves a new version and can be undone', async ({ page }) => {
  await page.goto('/tone');
  await page.getByRole('radio', { name: /Professional/ }).click();
  await page.getByRole('button', { name: 'Save tone and rules' }).click();
  await expect(page.getByText('Tone and rules saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Undone.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: /Friendly/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('versions')).toContainText('Version 3');
});

test('7. Test Center: test mode by default, sample question, response time, Live needs confirmation', async ({ page }) => {
  await page.goto('/test');
  await expect(page.getByTestId('mode-banner')).toHaveText(/Test mode: nothing is sent to real customers\./);
  await expect(page.getByTestId('samples').getByRole('button')).toHaveCount(5);
  await page.getByRole('button', { name: 'I want a refund and I am talking to my lawyer.' }).click();
  await page.getByTestId('ask').click();
  await expect(page.getByTestId('result')).toContainText('It would ask a person for help');
  await expect(page.getByTestId('result')).toContainText('Blocked word');
  await expect(page.getByTestId('response-time')).toContainText('under 10 seconds');
  await expect(page.getByTestId('ai-claude')).toContainText('% sure');
  await page.getByTestId('live-switch').click();
  await expect(page.getByRole('dialog')).toContainText('Turn on Live mode?');
  await page.getByRole('button', { name: 'No, go back' }).click();
  await expect(page.getByTestId('mode-banner')).toContainText('Test mode');
});

test('8. a conversation from n8n can be answered by the owner', async ({ page, request }) => {
  const res = await request.post('/api/internal/escalate', {
    headers: { 'X-Internal-Secret': SECRET },
    data: {
      requestId: 'req-e2e-00001',
      conversation: { id: 'chat:e2e0000000000000000001', channel: 'chat', customerEmail: null, customerName: 'Grace Hopper' },
      customerMessage: { body: 'Can I get a discount on 40 kettles?', receivedAt: new Date().toISOString() },
      reply: { text: 'A teammate will reply shortly.' },
      deliver: false,
      decision: { claude: { answer: 'We can offer 10% for 40 kettles.', confidence: 0.5, needs_human: true, reason: 'Not in FAQ' }, gemini: { agrees: false, confidence: 0.4, issues: [], needs_human: true }, threshold: 0.8, bothValid: true, geminiAgrees: false, anyNeedsHuman: true, forceHuman: false, reasons: [], reasonCode: 'unusual_question' },
      escalation: { reasonCode: 'unusual_question', reason: 'Not in FAQ', notifySlack: false },
    },
  });
  expect(res.ok()).toBeTruthy();
  expect((await request.post('/api/internal/escalate', { data: {} })).status()).toBe(401);

  await page.goto('/');
  await expect(page.getByTestId('needs-person')).toContainText('Grace Hopper');
  await page.getByTestId('needs-person').getByRole('link', { name: 'Open' }).click();
  await expect(page.getByText('Why? Unusual question')).toBeVisible();
  await expect(page.getByTestId('draft')).toContainText('10%');
  await page.getByRole('button', { name: 'Write my own reply' }).click();
  await page.getByLabel('Your reply').fill('Yes! For 40 kettles we can do 10% off.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, send it' }).click();
  await expect(page.getByTestId('thread')).toContainText('For 40 kettles');
  await page.goto('/conversations?status=done');
  await expect(page.getByTestId('conversation-list')).toContainText('Grace Hopper');
  const poll = await request.get('/api/public/chat/messages?conversationId=chat:e2e0000000000000000001&after=0');
  expect((await poll.json()).messages[0].text).toContain('10% off');
});

test('9. it works on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
