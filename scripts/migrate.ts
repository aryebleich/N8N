/**
 * Applies migrations/*.sql in order and records them in schema_migrations.
 *   npm run migrate
 * Files containing "migrate:statement-by-statement" run one statement at a time and
 * ignore "duplicate column name" errors, so ALTER TABLE ... ADD COLUMN is re-runnable.
 */
import { createClient, type Client } from '@libsql/client';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export async function migrate(client: Client, dir = path.join(process.cwd(), 'migrations'), log = console.log) {
  await client.execute('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set((await client.execute('SELECT name FROM schema_migrations')).rows.map((r) => String(r[0])));
  const files = readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), 'utf8');
    if (sql.includes('migrate:statement-by-statement')) {
      const statements = sql
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const st of statements) {
        try {
          await client.execute(st);
        } catch (e) {
          if (!/duplicate column name/i.test((e as Error).message)) throw new Error(`${file}: ${(e as Error).message}\n${st}`);
        }
      }
    } else {
      await client.executeMultiple(sql);
    }
    await client.execute({ sql: 'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', args: [file, new Date().toISOString()] });
    log(`applied ${file}`);
  }
  log('migrations up to date');
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for Turso) before running migrations.');
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  await migrate(client);
  client.close();
}

if (process.argv[1] && /migrate\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
