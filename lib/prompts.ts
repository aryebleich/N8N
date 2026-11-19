import 'server-only';
import { all, batch, get, nowIso } from './db';
import { auditStatement, type Actor } from './audit';
import { HttpError } from './errors';
import { validateTemplate, type PromptId } from './prompt-template';

export interface PromptRow { id: PromptId; name: string; body: string; version: number; updated_at: string }
export interface PromptVersion { version: number; body: string; changed_at: string; note: string | null }

export const getPrompt = (id: PromptId) => get<PromptRow>('SELECT id, name, body, version, updated_at FROM prompts WHERE id = ?', [id]);

export async function getPromptBodies(): Promise<Record<PromptId, string>> {
  const rows = await all<PromptRow>('SELECT id, body FROM prompts');
  return Object.fromEntries(rows.map((r) => [r.id, r.body])) as Record<PromptId, string>;
}

export const listVersions = (id: PromptId) =>
  all<PromptVersion>('SELECT version, body, changed_at, note FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC LIMIT 100', [id]);

/** Saves a new version (no-op when unchanged). Returns the version that was replaced, for Undo. */
export async function savePrompt(id: PromptId, body: string, note: string, actor: Actor, action = 'prompt.update') {
  const check = validateTemplate(id, body);
  if (!check.ok) throw new HttpError(400, check.errors.join(' '));
  const current = await getPrompt(id);
  if (!current) throw new HttpError(404, 'That text was not found. Restart the panel to load the defaults.');
  if (current.body === body) return { version: current.version, previousVersion: current.version, unchanged: true };
  const version = current.version + 1;
  const now = nowIso();
  await batch([
    { sql: 'UPDATE prompts SET body = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = ?', args: [body, version, now, actor.id, id] },
    { sql: 'INSERT INTO prompt_versions (prompt_id, version, body, changed_by, changed_at, note) VALUES (?, ?, ?, ?, ?, ?)', args: [id, version, body, actor.id, now, note || null] },
    auditStatement(actor, action, 'prompt', id, { version: current.version }, { version, note: note || null }),
  ]);
  return { version, previousVersion: current.version, unchanged: false };
}

export async function restorePrompt(id: PromptId, version: number, actor: Actor) {
  const v = await get<PromptVersion>('SELECT version, body FROM prompt_versions WHERE prompt_id = ? AND version = ?', [id, version]);
  if (!v) throw new HttpError(404, `Version ${version} does not exist.`);
  return savePrompt(id, v.body, `Restored version ${version}`, actor, 'prompt.restore');
}
