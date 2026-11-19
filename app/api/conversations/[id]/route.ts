import { adminRoute } from '@/lib/api';
import { getConversation, sendHumanReply, setDone } from '@/lib/conversations';
import { decodeParam } from '@/lib/params';
import { conversationActionSchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const GET = adminRoute<undefined, { id: string }>(null, async ({ params }) => ({ conversation: await getConversation(decodeParam(params.id)) }));

/** send = "Send this answer" / "Edit then send" / "Write my own reply"; done = "Mark as done"; reopen. */
export const POST = adminRoute<typeof conversationActionSchema._output, { id: string }>(conversationActionSchema, async ({ params, body, actor }) => {
  const id = decodeParam(params.id);
  if (body.action === 'send') return { ok: true, ...(await sendHumanReply(id, body.body, body.source, actor)) };
  await setDone(id, body.action === 'done', actor);
  return { ok: true };
});
