import { type NextRequest } from 'next/server';
import { json } from '@/lib/api';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/crypto';
import { getSettings } from '@/lib/settings';
import { applyRetention } from '@/lib/data';
import { SYSTEM_ACTOR } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Daily retention job. Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; Docker uses the cron service. */
export async function GET(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || !given || !safeEqual(given, secret)) return json({ error: 'Unauthorized' }, { status: 401 });
  const s = await getSettings();
  if (!s.retention_days) return json({ ok: true, skipped: 'retention is off' });
  return json({ ok: true, ...(await applyRetention(s.retention_days, SYSTEM_ACTOR)) });
}
