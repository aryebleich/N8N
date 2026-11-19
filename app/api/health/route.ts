import { get } from '@/lib/db';
import { json } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** For Docker and uptime monitors. No data, no keys. */
export async function GET() {
  try {
    await get('SELECT 1 AS ok');
    return json({ ok: true });
  } catch {
    return json({ ok: false }, { status: 503 });
  }
}
