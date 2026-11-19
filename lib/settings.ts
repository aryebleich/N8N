import 'server-only';
import { all, batch, nowIso } from './db';
import { auditStatement, type Actor } from './audit';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA, type SettingKey, type Settings } from './settings-schema';

const TTL_MS = 5000;
let cache: { at: number; value: Settings } | null = null;

/** Reads every setting (defaults for missing or invalid rows). Cached for 5 seconds; writes clear the cache. */
export async function getSettings(fresh = false): Promise<Settings> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
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
  cache = { at: Date.now(), value: out as Settings };
  return cache.value;
}

/** Saves only keys that changed, with one audit entry each, in one transaction. */
export async function updateSettings(patch: Partial<Settings>, actor: Actor): Promise<SettingKey[]> {
  const current = await getSettings(true);
  const changed: SettingKey[] = [];
  const statements = [];
  const now = nowIso();
  for (const [k, v] of Object.entries(patch) as [SettingKey, unknown][]) {
    if (v === undefined || JSON.stringify(current[k]) === JSON.stringify(v)) continue;
    changed.push(k);
    statements.push({
      sql: `INSERT INTO settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      args: [k, JSON.stringify(v), now, actor.id],
    });
    statements.push(auditStatement(actor, 'settings.update', 'settings', k, current[k], v));
  }
  if (statements.length) await batch(statements);
  cache = null;
  return changed;
}
