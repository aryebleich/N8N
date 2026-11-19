import Link from 'next/link';
import { Search } from 'lucide-react';
import { listConversations, PAGE_SIZE } from '@/lib/conversations';
import { conversationFilterSchema } from '@/lib/validators';
import { timeAgo } from '@/lib/utils';
import { PageHeader } from '@/components/sidebar';
import { ChannelLabel, ConversationBadge } from '@/components/conversation-badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conversations' };

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const f = conversationFilterSchema.parse(raw);
  const { items, total } = await listConversations(f);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (page: number) => new URLSearchParams(Object.entries({ channel: f.channel, status: f.status, q: f.q, page: String(page) }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <PageHeader title="Conversations" description="Every email and chat the assistant has handled. Open one to read it, see why the assistant did what it did, and reply." />
      <form method="get" className="mb-4 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" role="search">
        <div className="space-y-1">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={f.q} placeholder="Name, email address or words in the message" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="channel">Channel</Label>
          <NativeSelect id="channel" name="channel" defaultValue={f.channel ?? ''}>
            <option value="">Email and chat</option>
            <option value="email">Email only</option>
            <option value="chat">Chat only</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Status</Label>
          <NativeSelect id="status" name="status" defaultValue={f.status ?? ''}>
            <option value="">All</option>
            <option value="waiting">Waiting for a person</option>
            <option value="auto">Answered automatically</option>
            <option value="done">Resolved</option>
          </NativeSelect>
        </div>
        <Button type="submit"><Search /> Show</Button>
      </form>

      <p className="mb-2 text-sm text-muted-foreground">{total === 1 ? '1 conversation' : `${total} conversations`}{f.q || f.channel || f.status ? ' match' : ''}.</p>
      <Card className="divide-y" data-testid="conversation-list">
        {items.map((c) => (
          <Link key={c.id} href={`/conversations/${encodeURIComponent(c.id)}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{c.customer} <ChannelLabel channel={c.channel} /></p>
              {c.subject ? <p className="truncate text-sm">{c.subject}</p> : null}
              <p className="truncate text-muted-foreground">{c.preview || '(no text)'}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <ConversationBadge bucket={c.bucket} />
              <span className="text-sm text-muted-foreground">{timeAgo(c.lastAt)}</span>
            </div>
          </Link>
        ))}
        {!items.length ? (
          <div className="p-8 text-center text-muted-foreground">
            {f.q || f.channel || f.status ? 'Nothing matches. Try clearing the search or filters.' : 'No conversations yet. They appear here as soon as n8n handles the first email or chat. You can try the assistant in the Test Center.'}
          </div>
        ) : null}
      </Card>
      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between" aria-label="Pages">
          {f.page > 1 ? <Button asChild variant="outline"><Link href={`?${qs(f.page - 1)}`}>Newer</Link></Button> : <span />}
          <span className="text-sm text-muted-foreground">Page {f.page} of {pages}</span>
          {f.page < pages ? <Button asChild variant="outline"><Link href={`?${qs(f.page + 1)}`}>Older</Link></Button> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
