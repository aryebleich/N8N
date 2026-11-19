import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getConversation } from '@/lib/conversations';
import { decodeParam } from '@/lib/params';
import { formatDateTime } from '@/lib/utils';
import { ChannelLabel, ConversationBadge } from '@/components/conversation-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReplyActions } from './reply-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conversation' };

const pct = (n: number | null | undefined) => (n == null ? 'unknown' : `${Math.round(n * 100)}% sure`);
const WHO = { customer: 'Customer', assistant: 'Assistant', human: 'You' } as const;

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await getConversation(decodeParam((await params).id));
  if (!c) notFound();
  const who = c.customerName || c.customerEmail || (c.channel === 'chat' ? 'Website visitor' : 'Unknown sender');

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/conversations"><ArrowLeft /> All conversations</Link></Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{who}</h1>
          <p className="text-muted-foreground"><ChannelLabel channel={c.channel} />{c.customerEmail && c.customerName ? ` · ${c.customerEmail}` : ''}{c.subject ? ` · ${c.subject}` : ''}</p>
        </div>
        <ConversationBadge bucket={c.bucket} />
      </div>

      <Card>
        <CardHeader><CardTitle>Messages</CardTitle></CardHeader>
        <CardContent className="space-y-4" data-testid="thread">
          {c.messages.map((m) => (
            <div key={m.id} className={m.role === 'customer' ? 'flex justify-start' : 'flex justify-end'}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === 'customer' ? 'bg-muted' : m.role === 'human' ? 'bg-primary text-primary-foreground' : 'border bg-accent'}`}>
                <p className="mb-1 text-xs font-semibold opacity-80">
                  {WHO[m.role]}{m.role === 'assistant' && m.kind === 'holding' ? ' (holding message)' : ''} · {formatDateTime(m.createdAt)}{m.delivery === 'failed' ? ' · not delivered' : ''}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {c.why ? (
        <Card>
          <CardHeader><CardTitle>Why? {c.why.title}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-lg">{c.why.text}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {c.why.claude ? <li className="rounded-lg bg-muted p-3"><span className="font-semibold">Claude (writes the answer):</span> {pct(c.why.claude.confidence)}{c.why.claude.needsHuman ? ', asked for a person' : ''}.{c.why.claude.note ? ` “${c.why.claude.note}”` : ''}</li> : null}
              {c.why.gemini ? <li className="rounded-lg bg-muted p-3"><span className="font-semibold">Gemini (checks the answer):</span> {pct(c.why.gemini.confidence)}, {c.why.gemini.agrees ? 'agreed' : 'did not agree'}.{c.why.gemini.note ? ` ${c.why.gemini.note}` : ''}</li> : null}
            </ul>
            {c.why.threshold != null ? <p className="text-sm text-muted-foreground">Your confidence level at the time: both AIs had to be at least {Math.round(c.why.threshold * 100)}% sure.</p> : null}
            {c.why.details.length ? (
              <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Technical details</summary><ul className="mt-2 list-disc pl-5">{c.why.details.map((d, i) => <li key={i}>{d}</li>)}</ul></details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <ReplyActions id={c.id} draft={c.draft} bucket={c.bucket} channel={c.channel} canEmail={!!c.customerEmail} />
    </div>
  );
}
