import { route } from '@/lib/api';
import { exportQuerySchema } from '@/lib/validators';
import { exportConversationsCsv, exportEscalationsCsv } from '@/lib/data';
import { LIMITS } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { ApiError } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = route({ role: 'owner', schema: exportQuerySchema, rate: { name: 'export', ...LIMITS.export } }, async ({ body, actor }) => {
  if (body.from > body.to) throw new ApiError(400, 'The start date must be before the end date.');
  const out = body.type === 'conversations' ? await exportConversationsCsv(body.from, body.to) : await exportEscalationsCsv(body.from, body.to);
  await audit(actor, 'data.export', body.type, null, null, { from: body.from, to: body.to, rows: out.rows });
  return new Response(out.csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${body.type}-${body.from}-to-${body.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
