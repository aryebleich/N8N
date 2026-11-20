// npm run migrate — creates the tables and loads the sample data now, instead of on first start.
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { migrate } from '../lib/migrate';
import { describeDbUrl, normalizeDbUrl } from '../lib/db-url';

const url = normalizeDbUrl(process.env.TURSO_DATABASE_URL);
const token = (process.env.TURSO_AUTH_TOKEN || '').trim().replace(/^(['"])(.*)\1$/, '$2').replace(/^Bearer\s+/i, '') || undefined;
console.log(`Database: ${describeDbUrl(url)}`);
async function main() {
  try {
  if (url.startsWith('file:')) mkdirSync(path.dirname(path.resolve(url.replace(/^file:(\/\/)?/, ''))), { recursive: true });
  const client = createClient({ url, authToken: token });
  await migrate(client, (m) => console.log(m));
  console.log('Database is ready.');
  } catch (e) {
    console.error(`Could not prepare the database: ${(e as Error).message}`);
    console.error('TURSO_DATABASE_URL should look like libsql://your-db-yourorg.turso.io (from `turso db show <name> --url`).');
    process.exit(1);
  }
}
main();
