import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireUser, listAssignableUsers } from '@/lib/auth';
import { getConversation } from '@/lib/conversations';
import { decodeParam } from '@/lib/params';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChannelBadge, ConfidenceValue, ConversationStatusBadge, EscalationStatusBadge, PriorityBadge, ReasonBadge } from '@/components/badges';
import { LiveRefresh } from '@/components/live-refresh';
import { SlaTimer, TimeAgo } from '@/components/time-ago';
import { ConversationActions } from './actions';

export const metadata = { title: 'Conversation' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL = { customer: 'Customer', assistant: 'AI reply', human: 'Teammate' } as const;

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = decodeParam((await params).id);
  const [c, users] = await Promise.all([getConversation(id), listAssignableUsers()]);
  if (!c) notFound();
  const latest = c.decisions[0];
  const claude = latest?.claude as { answer?: string; confidence?: number; needs_human?: boolean; reason?: string; uses_account_data?: boolean } | null | undefined;
  const gemini = latest?.gemini as { agrees?: boolean; confidence?: number; issues?: string[]; needs_human?: boolean } | null | undefined;
  const meta = (latest?.meta || {}) as { identity?: { verified?: boolean; note?: string }; account_lookup?: string; retrieval?: { method?: string; count?: number } };

  return (
    <>
      <Link href="/conversations" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Conversations</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{c.customerName || c.customer}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <ChannelBadge channel={c.channel} /> <ConversationStatusBadge status={c.status} /> <span>{c.customer}</span>
            <span className="font-mono text-xs" title="Conversation id">{c.id.length > 60 ? `${c.id.slice(0, 60)}…` : c.id}</span>
          </p>
        </div>
        <LiveRefresh conversationId={c.id} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader><CardTitle>Messages</CardTitle></CardHeader>
            <CardContent>
              <ol className="grid gap-3">
                {c.messages.map((m) => (
                  <li key={m.id} className={m.role === 'customer' ? 'mr-8 rounded-lg border bg-muted/40 p-3' : 'ml-8 rounded-lg border border-primary/25 bg-accent/40 p-3'}>
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{m.role === 'human' && m.author ? `${m.author} (teammate)` : ROLE_LABEL[m.role]}</span>
                      <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
                      {m.delivery && m.delivery !== 'not_applicable' && <Badge variant={m.delivery === 'failed' ? 'destructive' : 'secondary'}>{m.delivery}</Badge>}
                    </div>
                    {/* React escapes this text; customer content is never rendered as HTML. */}
                    <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <ConversationActions
            conversationId={c.id}
            channel={c.channel}
            status={c.status}
            draft={claude?.answer ?? null}
            assigneeId={c.assigneeId}
            users={users.map((u) => ({ id: u.id, label: u.name || u.email }))}
            currentUserId={user.id}
          />
          <Card>
            <CardHeader><CardTitle>Internal notes</CardTitle><CardDescription>Only teammates see these.</CardDescription></CardHeader>
            <CardContent>
              {c.notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : (
                <ul className="grid gap-2">
                  {c.notes.map((n) => (
                    <li key={n.id} className="rounded-md border bg-warning/5 p-2.5 text-sm">
                      <p className="whitespace-pre-wrap break-words">{n.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{n.author} · <TimeAgo iso={n.createdAt} /></p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader><CardTitle>Decision</CardTitle><CardDescription>{latest ? `Latest of ${c.decisions.length} · ${formatDateTime(latest.createdAt)}` : 'No AI decision recorded for this conversation.'}</CardDescription></CardHeader>
            {latest && (
              <CardContent className="grid gap-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={latest.outcome === 'auto' ? 'success' : 'destructive'}>{latest.outcome === 'auto' ? 'Auto-sent' : 'Escalated'}</Badge>
                  <ReasonBadge code={latest.reasonCode} />
                  {latest.deliveryStatus === 'failed' && <Badge variant="destructive">delivery failed</Badge>}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Claude confidence</dt><dd><ConfidenceValue value={latest.claudeConfidence} threshold={latest.threshold} /></dd>
                  <dt className="text-muted-foreground">Gemini confidence</dt><dd><ConfidenceValue value={latest.geminiConfidence} threshold={latest.threshold} /></dd>
                  <dt className="text-muted-foreground">Threshold</dt><dd className="tabular-nums">{latest.threshold?.toFixed(2) ?? '—'}</dd>
                  <dt className="text-muted-foreground">Gemini agrees</dt><dd>{gemini?.agrees == null ? '—' : gemini.agrees ? 'Yes' : 'No'}</dd>
                  <dt className="text-muted-foreground">Identity</dt><dd>{meta.identity?.verified ? 'Verified' : 'Unverified'}</dd>
                  <dt className="text-muted-foreground">Account lookup</dt><dd>{meta.account_lookup ?? '—'}</dd>
                  <dt className="text-muted-foreground">FAQ retrieval</dt><dd>{meta.retrieval ? `${meta.retrieval.method} · ${meta.retrieval.count ?? 0} rows` : '—'}</dd>
                </dl>
                <div><p className="mb-1 font-medium">Decision reason</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{latest.reason || '—'}</p></div>
                <div>
                  <p className="mb-1 font-medium">Claude draft</p>
                  <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-2.5">{claude?.answer || '(no usable draft)'}</p>
                  {claude?.reason && <p className="mt-1 text-xs text-muted-foreground">Claude: {claude.reason}</p>}
                </div>
                <div>
                  <p className="mb-1 font-medium">Gemini review</p>
                  {gemini ? (
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {(gemini.issues?.length ? gemini.issues : ['No issues reported']).map((i, k) => <li key={k}>{i}</li>)}
                    </ul>
                  ) : <p className="text-muted-foreground">Gemini did not run (Claude output unusable).</p>}
                </div>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">Raw JSON</summary>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-xs">{JSON.stringify({ claude, gemini }, null, 2)}</pre>
                </details>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle>Oracle account</CardTitle><CardDescription>Read-only summary captured when the customer was verified. No payment data is stored.</CardDescription></CardHeader>
            <CardContent className="text-sm">
              {c.account ? (
                <>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <dt className="text-muted-foreground">Name</dt><dd>{String(c.account.full_name ?? '—')}</dd>
                    <dt className="text-muted-foreground">Customer id</dt><dd className="font-mono text-xs">{String(c.account.customer_id ?? c.oracleCustomerId ?? '—')}</dd>
                    <dt className="text-muted-foreground">Plan</dt><dd>{String(c.account.plan ?? '—')}</dd>
                    <dt className="text-muted-foreground">Status</dt><dd>{String(c.account.status ?? '—')}</dd>
                  </dl>
                  <p className="mb-1 mt-4 font-medium">Last orders</p>
                  {c.account.orders && c.account.orders.length ? (
                    <ul className="grid gap-1.5">
                      {c.account.orders.map((o, i) => (
                        <li key={i} className="flex flex-wrap justify-between gap-2 rounded-md border px-2.5 py-1.5">
                          <span className="font-mono text-xs">{String(o.order_id ?? '')}</span>
                          <span>{String(o.status ?? '')}</span>
                          <span className="tabular-nums text-muted-foreground">{o.total != null ? `${String(o.total)} ${String(o.currency ?? '')}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-muted-foreground">No orders in the summary.</p>}
                </>
              ) : <p className="text-muted-foreground">No verified account data for this conversation.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Escalations</CardTitle></CardHeader>
            <CardContent>
              {c.escalations.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
                <ul className="grid gap-2 text-sm">
                  {c.escalations.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">#{e.id}</span><EscalationStatusBadge status={e.status} /><PriorityBadge priority={e.priority} /><ReasonBadge code={e.reasonCode} />
                      <span className="text-xs text-muted-foreground">SLA <SlaTimer dueAt={e.slaDueAt} status={e.status} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
