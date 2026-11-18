import { test, expect, type Page } from '@playwright/test';

const SECRET = process.env.INTERNAL_API_SECRET || 'e2e-internal-secret-0123456789abcdef';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Password').fill('correct horse battery 42');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

function decision(c: number, g: number, agrees = true) {
  return { claude: { answer: 'Draft answer', confidence: c, needs_human: false, reason: 'r', uses_account_data: false }, gemini: { agrees, confidence: g, issues: [], needs_human: false }, threshold: 0.8, bothValid: true, geminiAgrees: agrees, anyNeedsHuman: false, forceHuman: false, reasons: [] };
}

test.describe.configure({ mode: 'serial' });

test('rejects bad credentials and protects pages', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Password').fill('wrong password 1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
});

test('internal endpoints require the shared secret and record conversations', async ({ request }) => {
  const denied = await request.post('/api/internal/send-reply', { data: {} });
  expect(denied.status()).toBe(401);
  const confidences: [number, number, boolean][] = [[0.95, 0.92, true], [0.82, 0.85, true], [0.7, 0.72, true], [0.65, 0.66, true], [0.9, 0.9, false]];
  for (const [i, [c, g, agrees]] of confidences.entries()) {
    const kind = c >= 0.8 && g >= 0.8 && agrees ? 'send-reply' : 'escalate';
    const res = await request.post(`/api/internal/${kind}`, {
      headers: { 'x-internal-secret': SECRET },
      data: {
        requestId: `e2e-request-${i}`,
        conversation: { id: `chat:e2e00000000000000000${i}`, channel: 'chat', customerEmail: `customer${i}@example.com`, customerName: `Customer ${i}` },
        customerMessage: { body: i === 4 ? 'Can the kettle go on a 3500 W induction hob?' : 'How long does shipping take?', receivedAt: new Date().toISOString() },
        reply: { text: kind === 'send-reply' ? 'Standard shipping takes 3 to 5 business days.' : 'A teammate will follow up shortly.' },
        deliver: false,
        decision: decision(c, g, agrees),
        meta: { identity: { verified: false }, account_lookup: 'not_requested' },
        ...(kind === 'escalate' ? { escalation: { reasonCode: agrees ? 'low_confidence' : 'models_disagree', reason: 'Below threshold', notifySlack: false } } : {}),
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
});

test('owner can browse every module without errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  await login(page);
  await expect(page.getByText('Messages received')).toBeVisible();
  for (const [path, heading] of [['/conversations', 'Conversations'], ['/escalations', 'Escalations'], ['/faq', 'Knowledge base'], ['/prompts', 'Prompts'], ['/settings', 'Settings'], ['/integrations', 'Integrations'], ['/users', 'Users'], ['/audit', 'Audit log'], ['/data', 'Data tools']] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  expect(problems.filter((p) => !/favicon/.test(p))).toEqual([]);
});

test('conversation detail shows the decision and accepts a note', async ({ page }) => {
  await login(page);
  await page.goto('/conversations?status=escalated');
  await page.getByRole('link', { name: 'Customer 4' }).click();
  await expect(page.getByText('Decision reason')).toBeVisible();
  await expect(page.getByText('Models disagree').first()).toBeVisible();
  await page.getByLabel('Internal note').fill('Checking with the warehouse.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Checking with the warehouse.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible();
});

test('FAQ entry can be created, edited and previewed', async ({ page }) => {
  await login(page);
  await page.goto('/faq');
  await page.getByRole('button', { name: 'New entry' }).click();
  await page.getByLabel('Question').fill('Do you offer gift wrapping?');
  await page.getByLabel('Answer').fill('Yes, for 4 USD per item.');
  await page.getByLabel('Tags').fill('gift, wrapping');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: /^Do you offer gift wrapping\? Yes/ })).toBeVisible();
  await page.getByRole('row', { name: /gift wrapping/ }).getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Answer').fill('Yes, for 5 USD per item.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('cell', { name: /^Do you offer gift wrapping\? Yes, for 5 USD/ })).toBeVisible();
  await page.getByRole('row', { name: /gift wrapping/ }).getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText(/\[FAQ #\d+\] Q: Do you offer gift wrapping\?/)).toBeVisible();
});

test('lowering the threshold changes the preview before saving', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  const preview = page.getByTestId('preview-all');
  await expect(preview).toContainText('2 of 5');
  await page.getByLabel('Default threshold').first().fill('0.6');
  await expect(preview).toContainText('4 of 5');
  await page.getByRole('button', { name: 'Save thresholds' }).click();
  await expect(page.getByText(/Saved/).first()).toBeVisible();
});

test('kill switch toggles with confirmation and is logged', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: /Email auto-reply/ }).click();
  await page.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByRole('button', { name: /Email auto-reply/ })).toContainText('OFF');
  await page.goto('/audit?action=settings.kill_switch');
  await expect(page.getByRole('cell', { name: 'settings.kill_switch' })).toBeVisible();
});

test('prompt edits are validated and versioned', async ({ page }) => {
  await login(page);
  await page.goto('/prompts/chat_greeting');
  const box = page.getByLabel('Prompt text');
  await box.fill('Hello {{customer_name}}');
  await expect(page.getByText(/not available in this prompt/)).toBeVisible();
  await box.fill('Hello from {{company_name}}, how can we help?');
  await page.getByRole('button', { name: /Save version 2/ }).click();
  await expect(page.getByText('v2').first()).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('button', { name: /Save version 4/ })).toBeVisible();
});

test('CSP header is strict and SSE requires a session', async ({ request }) => {
  const res = await request.get('/login');
  const csp = res.headers()['content-security-policy'];
  expect(csp).toContain("script-src 'self' 'nonce-");
  expect(csp).toContain("frame-ancestors 'none'");
  const sse = await request.get('/api/events/stream');
  expect(sse.status()).toBe(401);
});
