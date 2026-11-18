'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Pencil, RotateCcw, Send, StickyNote } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { useAction, useApi } from '@/components/csrf';

interface Props {
  conversationId: string;
  channel: 'email' | 'chat';
  status: string;
  draft: string | null;
  assigneeId: string | null;
  users: { id: string; label: string }[];
  currentUserId: string;
}

export function ConversationActions({ conversationId, channel, status, draft, assigneeId, users, currentUserId }: Props) {
  const api = useApi();
  const router = useRouter();
  const { pending, run } = useAction();
  const [reply, setReply] = React.useState('');
  const [note, setNote] = React.useState('');
  const url = `/api/conversations/${encodeURIComponent(conversationId)}`;
  const act = (body: Record<string, unknown>, ok: string) => run(async () => { await api('POST', url, body); router.refresh(); return true; }, ok);
  const delivery = channel === 'email' ? 'Sent by email in the same thread.' : 'Shown in the chat widget and sent to the customer by email.';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reply</CardTitle>
        <CardDescription>{delivery}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {draft && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => act({ action: 'send', source: 'draft', body: draft }, 'Draft sent')}>
              <Send aria-hidden /> Approve and send draft
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setReply(draft)}>
              <Pencil aria-hidden /> Edit draft
            </Button>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="reply">{draft ? 'Or write your own reply' : 'Write a reply'}</Label>
          <Textarea id="reply" rows={6} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="The greeting and signature are added automatically." maxLength={10000} />
          <div>
            <Button
              disabled={pending || !reply.trim()}
              onClick={async () => {
                const out = await act({ action: 'send', source: draft && reply === draft ? 'draft' : draft && reply.trim() ? 'edited' : 'manual', body: reply }, 'Reply sent');
                if (out !== undefined) setReply('');
              }}
            >
              <Send aria-hidden /> Send reply
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t pt-4">
          {status !== 'resolved' ? (
            <Button variant="secondary" disabled={pending} onClick={() => act({ action: 'resolve' }, 'Marked resolved')}><CheckCircle2 aria-hidden /> Mark resolved</Button>
          ) : (
            <Button variant="secondary" disabled={pending} onClick={() => act({ action: 'reopen' }, 'Reopened')}><RotateCcw aria-hidden /> Reopen</Button>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="assignee">Assigned to</Label>
            <NativeSelect id="assignee" className="w-56" value={assigneeId ?? ''} disabled={pending} onChange={(e) => act({ action: 'assign', userId: e.target.value || null }, 'Assignment updated')}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.id === currentUserId ? `${u.label} (me)` : u.label}</option>)}
            </NativeSelect>
          </div>
        </div>
        <div className="grid gap-1.5 border-t pt-4">
          <Label htmlFor="note">Internal note</Label>
          <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to teammates only" maxLength={5000} />
          <div>
            <Button variant="outline" disabled={pending || !note.trim()} onClick={async () => { const out = await act({ action: 'note', body: note }, 'Note added'); if (out !== undefined) setNote(''); }}>
              <StickyNote aria-hidden /> Add note
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
