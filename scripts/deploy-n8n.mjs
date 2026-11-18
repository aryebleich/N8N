#!/usr/bin/env node
/**
 * Deploys n8n/workflows/*.json to an n8n instance through its public REST API.
 *
 *   N8N_API_URL=https://n8n.example.com N8N_API_KEY=... node scripts/deploy-n8n.mjs
 *
 * - Finds each workflow by name; updates it in place or creates it.
 * - Credentials: keeps the ones you selected in n8n; otherwise, if the API key has the
 *   credential:list scope, picks the credential with the same name and type (the
 *   names in n8n/README.md), so a first deploy can activate without manual steps.
 * - Keeps what you set up in n8n: every node's credentials and the values of the
 *   ⚙️ CONFIG nodes (keys added in the repository are added with their defaults).
 * - Optional N8N_CONFIG_JSON (a JSON object) overrides CONFIG values in both
 *   workflows, e.g. {"ADMIN_SITE_URL":"https://...","TURSO_DATABASE_URL":"https://..."}.
 * - Links the main workflow to the error workflow and activates both.
 *   Activation failures (usually missing credentials on a first deploy) are
 *   reported as warnings, not errors, unless N8N_REQUIRE_ACTIVE=true.
 */
import { readFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';

const API = (process.env.N8N_API_URL || '').replace(/\/+$/, '');
const KEY = process.env.N8N_API_KEY || '';
const REQUIRE_ACTIVE = process.env.N8N_REQUIRE_ACTIVE === 'true';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const summary = (line) => {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
};

if (!API || !KEY) {
  summary('N8N_API_URL or N8N_API_KEY is not set; nothing to deploy.');
  process.exit(0);
}

let overrides = {};
if (process.env.N8N_CONFIG_JSON) {
  try {
    overrides = JSON.parse(process.env.N8N_CONFIG_JSON);
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('not an object');
  } catch (e) {
    console.error(`N8N_CONFIG_JSON must be a JSON object: ${e.message}`);
    process.exit(1);
  }
}

async function api(method, route, body) {
  const res = await fetch(`${API}/api/v1${route}`, {
    method,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`${method} ${route} → HTTP ${res.status}: ${data.message || text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function findByName(name) {
  let cursor;
  do {
    const page = await api('GET', `/workflows?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    const hit = (page.data || []).find((w) => w.name === name);
    if (hit) return api('GET', `/workflows/${hit.id}`);
    cursor = page.nextCursor;
  } while (cursor);
  return null;
}

/** Existing credentials (id, name, type), or null when the key may not list them. */
async function listCredentials() {
  try {
    const out = [];
    let cursor;
    do {
      const page = await api('GET', `/credentials?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      out.push(...(page.data || []));
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  } catch (e) {
    summary(`Credential list unavailable (${e.status || 'error'}); keeping credentials as selected in n8n.`);
    return null;
  }
}
let CREDENTIALS = null;

const isConfig = (n) => n.type === 'n8n-nodes-base.set' && n.name === '⚙️ CONFIG';

/** Merge repository workflow with what is live: keep credentials and CONFIG values. */
function merge(repo, live) {
  const liveByName = new Map((live?.nodes || []).map((n) => [n.name, n]));
  const nodes = repo.nodes.map((node) => {
    const n = structuredClone(node);
    const old = liveByName.get(n.name);
    if (n.credentials) {
      for (const type of Object.keys(n.credentials)) {
        const kept = old?.credentials?.[type];
        const exists = (ref) => !CREDENTIALS || CREDENTIALS.some((c) => c.id === ref.id);
        if (kept && exists(kept)) { n.credentials[type] = kept; continue; }
        const byName = CREDENTIALS?.find((c) => c.type === type && c.name === n.credentials[type].name);
        if (byName) n.credentials[type] = { id: byName.id, name: byName.name };
        else if (kept) n.credentials[type] = kept;
      }
    }
    if (isConfig(n)) {
      const liveValues = new Map((old?.parameters?.assignments?.assignments || []).map((a) => [a.name, a.value]));
      for (const a of n.parameters.assignments.assignments) {
        if (liveValues.has(a.name)) a.value = liveValues.get(a.name);
        if (Object.prototype.hasOwnProperty.call(overrides, a.name)) a.value = overrides[a.name];
      }
    }
    if (old?.webhookId) n.webhookId = old.webhookId;
    return n;
  });
  return nodes;
}

const SETTINGS_KEYS = ['executionOrder', 'saveManualExecutions', 'saveExecutionProgress', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'callerPolicy', 'errorWorkflow', 'timezone', 'executionTimeout'];
const pickSettings = (s) => Object.fromEntries(Object.entries(s || {}).filter(([k]) => SETTINGS_KEYS.includes(k)));

async function deploy(file, extraSettings = {}) {
  const repo = JSON.parse(readFileSync(path.join(ROOT, 'n8n', 'workflows', file), 'utf8'));
  const live = await findByName(repo.name);
  const body = {
    name: repo.name,
    nodes: merge(repo, live),
    connections: repo.connections,
    settings: { ...pickSettings(live?.settings), ...pickSettings(repo.settings), ...extraSettings },
  };
  const saved = live ? await api('PUT', `/workflows/${live.id}`, body) : await api('POST', '/workflows', body);
  summary(`${live ? 'Updated' : 'Created'} "${repo.name}" (id ${saved.id}, ${body.nodes.length} nodes)`);
  return saved;
}

async function activate(wf) {
  try {
    await api('POST', `/workflows/${wf.id}/activate`);
    summary(`Activated "${wf.name}"`);
  } catch (e) {
    const msg = `Could not activate "${wf.name}": ${e.message}. Open it in n8n, select any missing credentials, then re-run this deploy.`;
    if (REQUIRE_ACTIVE) throw new Error(msg);
    summary(`⚠️ ${msg}`);
  }
}

try {
  CREDENTIALS = await listCredentials();
  const errorWf = await deploy('error-handler.json');
  const mainWf = await deploy('support-dual-llm.json', { errorWorkflow: String(errorWf.id) });
  await activate(errorWf);
  await activate(mainWf);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
