import 'server-only';
import { z } from 'zod';
import { normalizeDbUrl } from './db-url';

/**
 * Every server-side setting comes from the environment (.env). Nothing here is ever
 * sent to the browser. Only TURSO_DATABASE_URL has a working default, so the panel
 * starts with zero configuration.
 */
const optional = z.string().trim().optional().transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ADMIN_PUBLIC: z.enum(['true', 'false']).default('false'),
  APP_URL: z.string().default('http://localhost:3000'),
  TURSO_DATABASE_URL: z.string().optional().transform((v) => normalizeDbUrl(v)),
  TURSO_AUTH_TOKEN: z.string().optional().transform((v) => (v ? v.trim().replace(/^(['"])(.*)\1$/, '$2').replace(/^Bearer\s+/i, '') : undefined) || undefined),
  INTERNAL_API_SECRET: optional,
  ANTHROPIC_API_KEY: optional,
  GOOGLE_AI_API_KEY: optional,
  SLACK_BOT_TOKEN: optional,
  ORACLE_ORDS_URL: optional,
  ORACLE_ORDS_USER: z.string().default('SUPPORT_RO'),
  ORACLE_ORDS_PASSWORD: optional,
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_SECURE: z.enum(['true', 'false']).default('true'),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  SMTP_FROM: optional,
  N8N_CHAT_WEBHOOK_URL: optional,
  WIDGET_SCRIPT_URL: z.string().default('https://aryebleich.github.io/N8N/widget.js'),
  WIDGET_ALLOWED_ORIGINS: z.string().default(''),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid .env settings: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  cached = parsed.data;
  return cached;
}

/** Which services have their keys in .env (never the keys themselves). */
export function configuredServices() {
  const e = env();
  return {
    database: true,
    anthropic: !!e.ANTHROPIC_API_KEY,
    google: !!e.GOOGLE_AI_API_KEY,
    slack: !!e.SLACK_BOT_TOKEN,
    oracle: !!(e.ORACLE_ORDS_URL && e.ORACLE_ORDS_PASSWORD),
    email: !!(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASSWORD),
    n8n: !!e.INTERNAL_API_SECRET,
  };
}
