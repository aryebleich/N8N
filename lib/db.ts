import 'server-only';
import { createClient, type Client, type InArgs, type InStatement, type ResultSet } from '@libsql/client';
import { env } from './env';

let client: Client | null = null;

/** Singleton Turso / libSQL client. Works with libsql://, https:// and file: URLs. */
export function db(): Client {
  if (!client) {
    const e = env();
    client = createClient({ url: e.TURSO_DATABASE_URL, authToken: e.TURSO_AUTH_TOKEN || undefined, intMode: 'number' });
  }
  return client;
}

export type Row = Record<string, unknown>;

export function rowsOf<T = Row>(rs: ResultSet): T[] {
  return rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])) as T);
}

export async function all<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  return rowsOf<T>(await db().execute({ sql, args }));
}

export async function get<T = Row>(sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

export async function run(sql: string, args: InArgs = []): Promise<ResultSet> {
  return db().execute({ sql, args });
}

/** Runs statements atomically in one transaction (one round trip on Turso). */
export async function batch(statements: InStatement[]): Promise<ResultSet[]> {
  return db().batch(statements, 'write');
}

export const nowIso = () => new Date().toISOString();
