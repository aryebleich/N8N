// npm run migrate — creates the tables and loads the sample data now, instead of on first start.
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { migrate } from '../lib/migrate';

const url = process.env.TURSO_DATABASE_URL || 'file:./data/support.db';
if (url.startsWith('file:')) mkdirSync(path.dirname(path.resolve(url.replace(/^file:(\/\/)?/, ''))), { recursive: true });
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
migrate(client, (m) => console.log(m))
  .then(() => console.log('Database is ready.'))
  .catch((e) => { console.error(e.message); process.exit(1); });
