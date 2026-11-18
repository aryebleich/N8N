import { get } from '@/lib/db';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness/readiness probe for Docker and uptime monitors. No auth, no data. */
export async function GET() {
  try {
    await get('SELECT 1 AS ok');
    return json({ ok: true });
  } catch {
    return json({ ok: false }, { status: 503 });
  }
}
