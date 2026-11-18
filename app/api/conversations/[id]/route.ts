import { route, ApiError } from '@/lib/api';
import { conversationActionSchema } from '@/lib/validators';
import { addNote, assignConversation, latestDraft, sendHumanReply, setConversationStatus } from '@/lib/conversations';
import { decodeParam } from '@/lib/params';

export const runtime = 'nodejs';

export const POST = route({ role: 'agent', schema: conversationActionSchema }, async ({ body, params, actor }) => {
  const id = decodeParam((params as { id: string }).id);
  switch (body.action) {
    case 'send': {
      let text = body.body;
      if (body.source === 'draft') {
        const draft = await latestDraft(id);
        if (!draft) throw new ApiError(400, 'There is no Claude draft to approve for this conversation.');
        text = draft;
      }
      return { ok: true, ...(await sendHumanReply(id, text, body.source, actor)) };
    }
    case 'resolve':
      await setConversationStatus(id, 'resolved', actor);
      return { ok: true };
    case 'reopen':
      await setConversationStatus(id, 'open', actor);
      return { ok: true };
    case 'note':
      await addNote(id, body.body, actor);
      return { ok: true };
    case 'assign':
      await assignConversation(id, body.userId, actor);
      return { ok: true };
  }
});
