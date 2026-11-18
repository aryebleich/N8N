/**
 * Playwright web server: fresh local SQLite database, migrations, owner seed, then `next start`.
 * Requires a production build (`npm run build`) first.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const port = process.argv[2] || '3100';
const dir = path.join(process.cwd(), 'data');
mkdirSync(dir, { recursive: true });
const dbFile = path.join(dir, 'e2e.db');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) rmSync(f, { force: true });

const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'production' as const,
  TURSO_DATABASE_URL: `file:${dbFile}`,
  APP_URL: `http://127.0.0.1:${port}`,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET || 'e2e-internal-secret-0123456789abcdef',
  ALLOW_INSECURE_COOKIES: 'true',
  OWNER_EMAIL: 'owner@example.com',
  OWNER_PASSWORD: 'correct horse battery 42',
};

for (const script of ['scripts/migrate.ts', 'scripts/seed-owner.ts']) {
  const r = spawnSync('npx', ['tsx', script], { env, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const child = spawn('npx', ['next', 'start', '-p', port, '-H', '127.0.0.1'], { env, stdio: 'inherit' });
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
