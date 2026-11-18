import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { ImapFlow } from 'imapflow';
import { all, get, run, nowIso } from './db';
import { getSecret } from './secrets';
import { getSettings } from './settings';
import { slackApi } from './slack';
import { smtpTransport } from './mailer';
import type { Service } from './validators';

export interface CheckResult {
  ok: boolean;
  latencyMs: number;
  detail: string;
  error: string | null;
}

export interface StatusRow {
  service: Service;
  last_success_at: string | null;
  last_latency_ms: number | null;
  last_error: string | null;
  last_error_at: string | null;
  last_checked_at: string | null;
}

export const SERVICE_LABELS: Record<Service, string> = {
  turso: 'Turso',
  oracle: 'Oracle ORDS',
  anthropic: 'Anthropic',
  google: 'Google AI Studio',
  slack: 'Slack',
  imap: 'IMAP',
  smtp: 'SMTP',
};

/** Records the outcome of any call to a service (tests and real traffic). */
export async function recordStatus(service: Service, ok: boolean, latencyMs: number, error: string | null) {
  const now = nowIso();
  await run(
    `INSERT INTO integration_status (service, last_success_at, last_latency_ms, last_error, last_error_at, last_checked_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(service) DO UPDATE SET
       last_success_at = COALESCE(excluded.last_success_at, integration_status.last_success_at),
       last_latency_ms = excluded.last_latency_ms,
       last_error      = CASE WHEN excluded.last_error IS NULL THEN integration_status.last_error ELSE excluded.last_error END,
       last_error_at   = CASE WHEN excluded.last_error IS NULL THEN integration_status.last_error_at ELSE excluded.last_error_at END,
       last_checked_at = excluded.last_checked_at`,
    [service, ok ? now : null, latencyMs, ok ? null : (error || 'failed').slice(0, 500), ok ? null : now, now],
  );
}

export async function listStatus(): Promise<StatusRow[]> {
  return all<StatusRow>('SELECT * FROM integration_status');
}

async function timed(fn: () => Promise<string>): Promise<CheckResult> {
  const started = Date.now();
  try {
    const detail = await fn();
    return { ok: true, latencyMs: Date.now() - started, detail, error: null };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    // Never echo secrets that libraries sometimes include in error text.
    return { ok: false, latencyMs: Date.now() - started, detail: '', error: msg.replace(/(sk-ant-|xoxb-|AIza)[\w-]+/g, '$1…').slice(0, 500) };
  }
}

const CHECKS: Record<Service, () => Promise<string>> = {
  async turso() {
    const r = await get<{ n: number }>('SELECT count(*) AS n FROM faq');
    return `Connected. ${r?.n ?? 0} FAQ rows.`;
  },
  async oracle() {
    const s = await getSettings();
    if (!s.integration_oracle.base_url) throw new Error('ORDS base URL is not set.');
    const password = await getSecret('oracle_ords_password');
    if (!password) throw new Error('ORDS password is missing.');
    // Read-only: GET on the health handler of the SUPPORT_RO module.
    const res = await fetch(`${s.integration_oracle.base_url.replace(/\/+$/, '')}/support/health`, {
      method: 'GET',
      headers: { Authorization: `Basic ${Buffer.from(`${s.integration_oracle.user}:${password}`).toString('base64')}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`ORDS answered HTTP ${res.status}`);
    return 'GET /support/health returned 200.';
  },
  async anthropic() {
    const s = await getSettings();
    const apiKey = await getSecret('anthropic_api_key');
    if (!apiKey) throw new Error('Anthropic API key is missing.');
    const client = new Anthropic({ apiKey, timeout: 10_000, maxRetries: 0 });
    const m = await client.models.retrieve(s.claude_model);
    return `Key works. Model ${m.id} is available.`;
  },
  async google() {
    const s = await getSettings();
    const apiKey = await getSecret('google_ai_api_key');
    if (!apiKey) throw new Error('Google AI Studio key is missing.');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.gemini_model)}`, {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.error?.message || res.statusText}`);
    return `Key works. ${data.name || s.gemini_model} is available.`;
  },
  async slack() {
    const data = await slackApi('auth.test', {});
    return `Signed in as ${String(data.user)} in ${String(data.team)}.`;
  },
  async imap() {
    const s = await getSettings();
    const cfg = s.integration_imap;
    if (!cfg.host || !cfg.user) throw new Error('IMAP host and user are not set.');
    const pass = await getSecret('imap_password');
    if (!pass) throw new Error('IMAP password is missing.');
    const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: { user: cfg.user, pass }, logger: false, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 });
    await client.connect();
    try {
      const status = await client.status('INBOX', { messages: true, unseen: true });
      if (!status) return 'Signed in. INBOX status unavailable.';
      return `Signed in. INBOX has ${status.messages ?? 0} messages, ${status.unseen ?? 0} unread.`;
    } finally {
      await client.logout().catch(() => undefined);
    }
  },
  async smtp() {
    const { transport } = await smtpTransport();
    await transport.verify();
    transport.close();
    return 'SMTP server accepted the login.';
  },
};

export async function testService(service: Service): Promise<CheckResult> {
  const result = await timed(CHECKS[service]);
  await recordStatus(service, result.ok, result.latencyMs, result.error);
  return result;
}
