'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, PenLine, RotateCcw, Send } from 'lucide-react';
import { api, useAction } from '@/components/api';
import { ConfirmDialog } from '@/components/confirm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Bucket } from '@/lib/conversations';

export function ReplyActions({ id, draft, bucket, channel, canEmail }: { id: string; draft: string | null; bucket: Bucket; channel: 'email' | 'chat'; canEmail: boolean }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [mode, setMode] = React.useState<'view' | 'edited' | 'manual'>('view');
  const [text, setText] = React.useState('');
  const [confirm, setConfirm] = React.useState<null | { body: string; source: 'draft' | 'edited' | 'manual' }>(null);
  const url = `/api/conversations/${encodeURIComponent(id)}`;
  const where = channel === 'email' ? 'by email' : canEmail ? 'in the chat window and by email' : 'in the chat window';

  const send = (body: string, source: 'draft' | 'edited' | 'manual') =>
    run(async () => { await api('POST', url, { action: 'send', body, source }); setConfirm(null); setMode('view'); router.refresh(); }, 'Sent. The conversation is marked as resolved.');
  const done = (v: boolean) => run(async () => { await api('POST', url, { action: v ? 'done' : 'reopen' }); router.refresh(); }, v ? 'Marked as done.' : 'Opened again.');

  return (
    <Card>
      <CardHeader><CardTitle>{bucket === 'waiting' ? "The assistant's answer" : 'Reply'}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {mode === 'view' ? (
          <>
            {draft ? (
              <div className="rounded-lg border bg-accent p-4"><p className="whitespace-pre-wrap" data-testid="draft">{draft}</p></div>
            ) : (
              <p className="text-muted-foreground">The assistant did not write a usable answer for this one. Write your own reply.</p>
            )}
            <div className="flex flex-wrap gap-3">
              {draft ? <Button size="lg" variant="success" disabled={pending} onClick={() => setConfirm({ body: draft, source: 'draft' })}><Send /> Send this answer</Button> : null}
              {draft ? <Button size="lg" variant="outline" onClick={() => { setText(draft); setMode('edited'); }}><Pencil /> Edit then send</Button> : null}
              <Button size="lg" variant="outline" onClick={() => { setText(''); setMode('manual'); }}><PenLine /> Write my own reply</Button>
              {bucket !== 'done' ? (
                <Button size="lg" variant="outline" disabled={pending} onClick={() => done(true)}><Check /> Mark as done</Button>
              ) : (
                <Button size="lg" variant="outline" disabled={pending} onClick={() => done(false)}><RotateCcw /> Open again</Button>
              )}
            </div>
          </>
        ) : (
          <>
            <Textarea autoFocus rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your reply. A greeting and your email signature are added for you." aria-label="Your reply" />
            <div className="flex flex-wrap gap-3">
              <Button size="lg" variant="success" disabled={pending || !text.trim()} onClick={() => setConfirm({ body: text.trim(), source: mode })}><Send /> Send</Button>
              <Button size="lg" variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
            </div>
          </>
        )}
        <p className="text-sm text-muted-foreground">Replies are sent {where}. {channel === 'email' ? 'They arrive in the same email thread.' : ''}</p>
      </CardContent>
      <ConfirmDialog
        open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} busy={pending} variant="success" title="Send this reply?" confirmLabel="Yes, send it"
        explanation={`This sends your reply to the customer ${where}. You cannot take it back once it is sent.`}
        onConfirm={() => confirm && send(confirm.body, confirm.source)}
      />
    </Card>
  );
}
