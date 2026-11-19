import { adminRoute } from '@/lib/api';
import { serviceStatus } from '@/lib/health';

export const dynamic = 'force-dynamic';
/** Status lights only. Keys never leave the server. */
export const GET = adminRoute(null, async ({ req }) => ({ services: await serviceStatus(req.nextUrl.searchParams.get('fresh') === '1') }));
