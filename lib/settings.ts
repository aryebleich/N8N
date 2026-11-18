import 'server-only';
import { all, batch, nowIso } from './db';
import { auditStatement, type Actor } from './audit';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA, type SettingKey, type Settings } from './settings-schema';

/** Reads every setting, falling back to defaults for missing or invalid rows. */
export async function getSettings(): Promise<Settings> {
  const rows = await all<{ key: string; value_json: string }>('SELECT key, value_json FROM settings');
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) {
    if (!(r.key in SETTINGS_SCHEMA)) continue;
    try {
      const parsed = SETTINGS_SCHEMA[r.key as SettingKey].safeParse(JSON.parse(r.value_json));
      if (parsed.success) out[r.key] = parsed.data;
    } catch {
      /* keep the default */
    }
  }
  return out as Settings;
}

export async function getSettingsMeta(): Promise<Record<string, { updated_at: string; updated_by: string | null }>> {
  const rows = await all<{ key: string; updated_at: string; updated_by: string | null }>('SELECT key, updated_at, updated_by FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, { updated_at: r.updated_at, updated_by: r.updated_by }]));
}

/** Writes changed keys and one audit entry per changed key, in a single transaction. */
export async function updateSettings(patch: Partial<Settings>, actor: Actor): Promise<SettingKey[]> {
  const current = await getSettings();
  const changed: SettingKey[] = [];
  const statements = [];
  const now = nowIso();
  for (const [k, v] of Object.entries(patch) as [SettingKey, unknown][]) {
    if (v === undefined) continue;
    if (JSON.stringify(current[k]) === JSON.stringify(v)) continue;
    changed.push(k);
    statements.push({
      sql: `INSERT INTO settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      args: [k, JSON.stringify(v), now, actor.id],
    });
    const action = k === 'auto_reply_email' || k === 'auto_reply_chat' ? 'settings.kill_switch' : 'settings.update';
    statements.push(auditStatement(actor, action, 'settings', k, current[k], v));
  }
  if (statements.length) await batch(statements);
  return changed;
}
