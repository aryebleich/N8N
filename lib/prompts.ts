import 'server-only';
import { all, batch, get, nowIso } from './db';
import { auditStatement, type Actor } from './audit';
import { ApiError } from './api';
import { PROMPT_DEFS, validateTemplate, type PromptId } from './prompt-template';

export interface PromptRow {
  id: PromptId;
  name: string;
  body: string;
  version: number;
  updated_at: string;
  updated_by: string | null;
}

export interface PromptVersionRow {
  prompt_id: string;
  version: number;
  body: string;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
  changed_by_email?: string | null;
}

export async function listPrompts(): Promise<PromptRow[]> {
  return all<PromptRow>('SELECT id, name, body, version, updated_at, updated_by FROM prompts ORDER BY id');
}

export async function getPrompt(id: PromptId): Promise<PromptRow | undefined> {
  return get<PromptRow>('SELECT id, name, body, version, updated_at, updated_by FROM prompts WHERE id = ?', [id]);
}

export async function getPromptBodies(): Promise<Record<PromptId, string>> {
  const rows = await listPrompts();
  return Object.fromEntries(rows.map((r) => [r.id, r.body])) as Record<PromptId, string>;
}

export async function listVersions(id: PromptId): Promise<PromptVersionRow[]> {
  return all<PromptVersionRow>(
    `SELECT v.prompt_id, v.version, v.body, v.changed_by, v.changed_at, v.note, u.email AS changed_by_email
       FROM prompt_versions v LEFT JOIN users u ON u.id = v.changed_by
      WHERE v.prompt_id = ? ORDER BY v.version DESC`,
    [id],
  );
}

/** Saves a new version. `expectedVersion` prevents two editors from overwriting each other. */
export async function savePrompt(id: PromptId, body: string, note: string, expectedVersion: number, actor: Actor, action = 'prompt.update') {
  const check = validateTemplate(id, body);
  if (!check.ok) throw new ApiError(400, 'The template has errors.', check.errors);
  const current = await getPrompt(id);
  if (!current) throw new ApiError(404, 'Prompt not found.');
  if (current.version !== expectedVersion) {
    throw new ApiError(409, `Someone saved version ${current.version} while you were editing. Reload to see it, then reapply your changes.`);
  }
  if (current.body === body) return { version: current.version, unchanged: true, warnings: check.warnings };
  const version = current.version + 1;
  const now = nowIso();
  await batch([
    { sql: 'UPDATE prompts SET body = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = ? AND version = ?', args: [body, version, now, actor.id, id, current.version] },
    { sql: 'INSERT INTO prompt_versions (prompt_id, version, body, changed_by, changed_at, note) VALUES (?, ?, ?, ?, ?, ?)', args: [id, version, body, actor.id, now, note || null] },
    auditStatement(actor, action, 'prompt', id, { version: current.version, body: current.body }, { version, body, note: note || null }),
  ]);
  return { version, unchanged: false, warnings: check.warnings };
}

export async function restorePrompt(id: PromptId, version: number, actor: Actor) {
  const v = await get<PromptVersionRow>('SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?', [id, version]);
  if (!v) throw new ApiError(404, `Version ${version} does not exist.`);
  const current = await getPrompt(id);
  if (!current) throw new ApiError(404, 'Prompt not found.');
  return savePrompt(id, v.body, `Restored version ${version}`, current.version, actor, 'prompt.restore');
}

export const promptName = (id: PromptId) => PROMPT_DEFS[id].name;
