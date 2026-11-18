import 'server-only';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_URL: z.url().default('http://localhost:3000'),
  TURSO_DATABASE_URL: z.string().min(1),
  TURSO_AUTH_TOKEN: z.string().optional(),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)'),
  INTERNAL_API_SECRET: z.string().min(24, 'INTERNAL_API_SECRET must be at least 24 characters'),
  CRON_SECRET: z.string().min(16).optional(),
  N8N_CHAT_WEBHOOK_URL: z.string().optional().default(''),
  WIDGET_ALLOWED_ORIGINS: z.string().optional().default(''),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  TRUST_PROXY: z.enum(['true', 'false']).default('true'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === 'production';
