import 'server-only';
import type { Actor } from './audit';
import { getPrompt, savePrompt } from './prompts';
import { getSettings, updateSettings } from './settings';
import { buildClaudeSystem } from './tone';
import type { PromptId } from './prompt-template';
import type { Settings } from './settings-schema';

export const TONE_KEYS = ['tone_style', 'tone_custom', 'never_rules', 'never_custom', 'company_name', 'prompt_mode'] as const;
type ToneSettings = Pick<Settings, (typeof TONE_KEYS)[number]>;
export interface ToneSnapshot { settings: ToneSettings; versions: Partial<Record<PromptId, number>> }

const TEXT_PROMPTS = ['email_signature', 'chat_greeting', 'holding_message'] as const;

export async function toneSnapshot(): Promise<ToneSnapshot> {
  const s = await getSettings(true);
  const versions: Partial<Record<PromptId, number>> = {};
  for (const id of ['claude_system', ...TEXT_PROMPTS] as PromptId[]) versions[id] = (await getPrompt(id))?.version;
  return { settings: Object.fromEntries(TONE_KEYS.map((k) => [k, s[k]])) as ToneSettings, versions };
}

/**
 * Saves the Tone and Rules page. When the instructions are in "recommended" mode, the
 * Claude instructions are rebuilt from the tone choices; in "custom" mode the owner's own
 * text is kept. Returns the snapshot from before the save, for Undo.
 */
export async function saveTone(
  input: Pick<Settings, 'tone_style' | 'tone_custom' | 'never_rules' | 'never_custom' | 'company_name'> & Record<(typeof TEXT_PROMPTS)[number], string>,
  actor: Actor,
) {
  const before = await toneSnapshot();
  await updateSettings({ tone_style: input.tone_style, tone_custom: input.tone_custom, never_rules: input.never_rules, never_custom: input.never_custom, company_name: input.company_name }, actor);
  for (const id of TEXT_PROMPTS) await savePrompt(id, input[id], 'Saved on Tone and Rules', actor);
  const s = await getSettings(true);
  if (s.prompt_mode === 'recommended') await savePrompt('claude_system', buildClaudeSystem(s), 'Rebuilt from tone choices', actor);
  return before;
}

/** "Reset to recommended": the Claude instructions follow the tone choices again. */
export async function resetToRecommended(actor: Actor) {
  const before = await toneSnapshot();
  await updateSettings({ prompt_mode: 'recommended' }, actor);
  await savePrompt('claude_system', buildClaudeSystem(await getSettings(true)), 'Reset to recommended', actor, 'prompt.reset');
  return before;
}

/** Undo: puts settings and every text back to the snapshot (each restore is itself a new version). */
export async function restoreTone(snap: ToneSnapshot, actor: Actor) {
  const { restorePrompt } = await import('./prompts');
  await updateSettings(snap.settings, actor);
  for (const [id, version] of Object.entries(snap.versions) as [PromptId, number | undefined][]) {
    if (!version) continue;
    const cur = await getPrompt(id);
    if (cur && cur.version !== version) await restorePrompt(id, version, actor);
  }
}
