import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, all, get } from '@/lib/db';
import { migrate } from '@/lib/migrate';
import { prepareDatabase } from '@/lib/startup';
import { buildSampleCsv, buildSeedSql } from '@/lib/seed-source';
import { SEED_SQL } from '@/lib/seed-bundle';
import { MIGRATIONS } from '@/lib/migrations-bundle';
import { DEFAULT_SETTINGS } from '@/lib/settings-schema';
import { PROMPT_IDS } from '@/lib/prompt-template';

beforeAll(() => prepareDatabase());

describe('migrations and seed', () => {
  it('has exactly the three migration files, bundled', () => {
    expect(MIGRATIONS.map((m) => m.name)).toEqual(['001_core.sql', '002_faq_prompts.sql', '003_conversations.sql']);
    for (const m of MIGRATIONS) expect(readFileSync(`migrations/${m.name}`, 'utf8')).toBe(m.sql);
  });

  it('creates every table', async () => {
    const names = (await all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => r.name);
    for (const t of ['settings', 'faq', 'prompts', 'prompt_versions', 'conversations', 'messages', 'escalations', 'audit_log', 'session_tokens']) expect(names).toContain(t);
  });

  it('is safe to run again and never seeds twice', async () => {
    await migrate(db());
    await migrate(db());
    expect((await get<{ n: number }>('SELECT count(*) AS n FROM faq'))?.n).toBe(12);
    expect((await get<{ n: number }>('SELECT count(*) AS n FROM prompts'))?.n).toBe(PROMPT_IDS.length);
  });

  it('seeds every default setting', async () => {
    const keys = (await all<{ key: string }>('SELECT key FROM settings')).map((r) => r.key);
    for (const k of Object.keys(DEFAULT_SETTINGS)) expect(keys).toContain(k);
  });

  it('keeps seeds/sample-data.sql and docs/sample-faq.csv in sync with the code', () => {
    expect(readFileSync('seeds/sample-data.sql', 'utf8')).toBe(buildSeedSql());
    expect(SEED_SQL).toBe(buildSeedSql());
    expect(readFileSync('docs/sample-faq.csv', 'utf8')).toBe(buildSampleCsv());
  });

  it('keeps the audit log append-only', async () => {
    await db().execute("INSERT INTO audit_log (actor_id, action, entity, created_at) VALUES ('admin', 'x', 'y', 'now')");
    await expect(db().execute('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
  });
});
