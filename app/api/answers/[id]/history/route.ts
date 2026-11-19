import { adminRoute } from '@/lib/api';
import { answerHistory } from '@/lib/faq-admin';

export const dynamic = 'force-dynamic';
export const GET = adminRoute<undefined, { id: string }>(null, async ({ params }) => ({ history: await answerHistory(Number(params.id)) }));
