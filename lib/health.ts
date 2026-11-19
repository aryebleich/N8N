import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';
import { get, run, nowIso } from './db';
import { getSettings } from './settings';
import { slackApi } from './slack';
import { smtpTransport } from './mailer';

/**
 * One status light per service. Keys are only ever read from .env on the server;
 * this module returns colours and plain sentences, never a key.
 *  green  = Connected
 *  yellow = the key is in .env, but the service did not answer
 *  red    = Not connected (nothing in .env)
 */
export type Light = 'green' | 'yellow' | 'red';
export interface ServiceStatus { id: ServiceId; name: string; what: string; light: Light; label: string; detail: string; envVars: string[] }
export type ServiceId = 'database' | 'anthropic' | 'google' | 'slack' | 'oracle' | 'email' | 'n8n';

const INFO: Record<ServiceId, { name: string; what: string; envVars: string[] }> = {
  database: { name: 'Database', what: 'Stores your answers, settings and conversations.', envVars: ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'] },
  anthropic: { name: 'Claude (Anthropic)', what: 'Writes the answers.', envVars: ['ANTHROPIC_API_KEY'] },
  google: { name: 'Gemini (Google AI Studio)', what: 'Double-checks every answer.', envVars: ['GOOGLE_AI_API_KEY'] },
  slack: { name: 'Slack', what: 'Tells your team when a person is needed.', envVars: ['SLACK_BOT_TOKEN'] },
  oracle: { name: 'Oracle (customer accounts)', what: 'Lets the assistant look up orders, read-only.', envVars: ['ORACLE_ORDS_URL', 'ORACLE_ORDS_USER', 'ORACLE_ORDS_PASSWORD'] },
  email: { name: 'Email sending', what: 'Sends email replies to customers.', envVars: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'] },
  n8n: { name: 'n8n workflow', what: 'Reads your inbox and chat and runs the assistant.', envVars: ['INTERNAL_API_SECRET'] },
};

const redact = (m: string) => m.replace(/(sk-ant-|xoxb-|AIza)[\w-]+/g, '$1…').slice(0, 300);

async function check(id: ServiceId): Promise<{ light: Light; detail: string }> {
  const e = env();
  const s = await getSettings();
  const ok = (detail: string) => ({ light: 'green' as Light, detail });
  const missing = (detail: string) => ({ light: 'red' as Light, detail });
  switch (id) {
    case 'database': {
      const r = await get<{ n: number }>('SELECT count(*) AS n FROM faq');
      return ok(`${r?.n ?? 0} answers stored${e.TURSO_DATABASE_URL.startsWith('file:') ? ' in a local file' : ' in Turso'}.`);
    }
    case 'anthropic': {
      if (!e.ANTHROPIC_API_KEY) return missing('Add ANTHROPIC_API_KEY to .env. Until then the Test Center uses the offline simulator.');
      const m = await new Anthropic({ apiKey: e.ANTHROPIC_API_KEY, timeout: 8000, maxRetries: 0 }).models.retrieve(s.claude_model);
      return ok(`Model ${m.id} is ready.`);
    }
    case 'google': {
      if (!e.GOOGLE_AI_API_KEY) return missing('Add GOOGLE_AI_API_KEY to .env. Until then the Test Center uses the offline simulator.');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.gemini_model)}`, { headers: { 'x-goog-api-key': e.GOOGLE_AI_API_KEY }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Google answered HTTP ${res.status}. Check the key and the model name.`);
      return ok(`Model ${s.gemini_model} is ready.`);
    }
    case 'slack': {
      if (!e.SLACK_BOT_TOKEN) return missing('Add SLACK_BOT_TOKEN to .env to get alerts in Slack.');
      const d = await slackApi('auth.test', {});
      return ok(`Signed in to ${String(d.team)}${s.slack_channel ? `, posting to ${s.slack_channel}` : '. Pick a channel under Settings.'}`);
    }
    case 'oracle': {
      if (!e.ORACLE_ORDS_URL || !e.ORACLE_ORDS_PASSWORD) return missing('Optional. Add ORACLE_ORDS_URL and ORACLE_ORDS_PASSWORD to .env so the assistant can look up orders.');
      const res = await fetch(`${e.ORACLE_ORDS_URL.replace(/\/+$/, '')}/support/health`, {
        headers: { Authorization: `Basic ${Buffer.from(`${e.ORACLE_ORDS_USER}:${e.ORACLE_ORDS_PASSWORD}`).toString('base64')}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Oracle answered HTTP ${res.status}.`);
      return ok('Read-only connection works.');
    }
    case 'email': {
      if (!e.SMTP_HOST || !e.SMTP_USER || !e.SMTP_PASSWORD) return missing('Add SMTP_HOST, SMTP_USER and SMTP_PASSWORD to .env to send email replies.');
      const { transport } = await smtpTransport();
      await transport.verify();
      transport.close();
      return ok(`Signed in to ${e.SMTP_HOST}.`);
    }
    case 'n8n': {
      if (!e.INTERNAL_API_SECRET) return missing('Add INTERNAL_API_SECRET to .env (and the same value in n8n) so the workflow can talk to this panel.');
      const seen = await lastN8nContact();
      if (!seen) return { light: 'yellow', detail: 'Ready, but n8n has not contacted this panel yet.' };
      const mins = Math.round((Date.now() - new Date(seen).getTime()) / 60000);
      return mins > 60 * 24 ? { light: 'yellow', detail: `Last heard from n8n ${Math.round(mins / 60)} hours ago.` } : ok(`Last heard from n8n ${mins < 1 ? 'just now' : `${mins} min ago`}.`);
    }
  }
}

let cache: { at: number; value: ServiceStatus[] } | null = null;

export async function serviceStatus(fresh = false): Promise<ServiceStatus[]> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.value;
  const ids = Object.keys(INFO) as ServiceId[];
  const value = await Promise.all(
    ids.map(async (id) => {
      let r: { light: Light; detail: string };
      try {
        r = await check(id);
      } catch (err) {
        r = { light: 'yellow', detail: `The key is in .env, but the service did not answer: ${redact((err as Error).message || String(err))}` };
      }
      const label = r.light === 'green' ? 'Connected' : r.light === 'yellow' ? 'Check needed' : 'Not connected';
      return { id, ...INFO[id], ...r, label };
    }),
  );
  cache = { at: Date.now(), value };
  return value;
}

const N8N_SEEN_KEY = 'n8n_last_seen';
let lastWrite = 0;
/** Called by the internal endpoints. Written at most once a minute. */
export async function markN8nSeen() {
  if (Date.now() - lastWrite < 60_000) return;
  lastWrite = Date.now();
  await run(
    'INSERT INTO settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at',
    [N8N_SEEN_KEY, JSON.stringify(nowIso()), nowIso(), 'n8n'],
  ).catch(() => undefined);
}
async function lastN8nContact(): Promise<string | null> {
  const r = await get<{ value_json: string }>('SELECT value_json FROM settings WHERE key = ?', [N8N_SEEN_KEY]);
  try { return r ? JSON.parse(r.value_json) : null; } catch { return null; }
}
