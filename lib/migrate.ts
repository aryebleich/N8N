import type { Client } from '@libsql/client';
import { MIGRATIONS } from './migrations-bundle';
import { SEED_SQL, SEED_VERSION } from './seed-bundle';

/**
 * Applies migrations/*.sql (bundled into lib/migrations-bundle.ts) in order, then the
 * sample data in seeds/sample-data.sql once. Used on server start (instrumentation.ts)
 * and by `npm run migrate`. Safe to run any number of times.
 */
export async function migrate(client: Client, log: (m: string) => void = () => undefined) {
  await client.execute('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set((await client.execute('SELECT name FROM schema_migrations')).rows.map((r) => String(r[0])));
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    if (m.sql.includes('migrate:statement-by-statement')) {
      const statements = m.sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean);
      for (const st of statements) {
        try {
          await client.execute(st);
        } catch (e) {
          if (!/duplicate column name/i.test((e as Error).message)) throw new Error(`${m.name}: ${(e as Error).message}\n${st}`);
        }
      }
    } else {
      await client.executeMultiple(m.sql);
    }
    await client.execute({ sql: 'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', args: [m.name, new Date().toISOString()] });
    log(`applied ${m.name}`);
  }
  const seeded = await client.execute({ sql: 'SELECT value_json FROM settings WHERE key = ?', args: ['seed_version'] });
  if (!seeded.rows.length) {
    await client.executeMultiple(SEED_SQL);
    await client.execute({ sql: 'INSERT OR REPLACE INTO settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?)', args: ['seed_version', JSON.stringify(SEED_VERSION), new Date().toISOString(), 'system'] });
    log('loaded sample data');
  }
}
