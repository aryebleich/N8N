import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db';
import { env } from './env';
import { migrate } from './migrate';

let ready: Promise<void> | null = null;

/** Creates the local data folder (for file: databases), then migrates and seeds. Safe to call repeatedly. */
export function prepareDatabase(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const url = env().TURSO_DATABASE_URL;
      if (url.startsWith('file:')) {
        const file = url.startsWith('file://') ? fileURLToPath(url) : url.slice(5);
        mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      }
      await migrate(db(), (m) => console.log(`[database] ${m}`));
    })().catch((e) => {
      ready = null;
      console.error('[database] could not prepare the database:', (e as Error).message);
      throw e;
    });
  }
  return ready;
}
