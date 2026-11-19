import { adminRoute } from '@/lib/api';
import { createAnswer, listAnswers } from '@/lib/faq-admin';
import { answerSchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(null, async () => ({ answers: await listAnswers() }));
export const POST = adminRoute(answerSchema, async ({ body, actor }) => ({ ok: true, id: await createAnswer(body, actor) }));
