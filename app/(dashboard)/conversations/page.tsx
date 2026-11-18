import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listConversations, PAGE_SIZE } from '@/lib/conversations';
import { conversationFilterSchema } from '@/lib/validators';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChannelBadge, ConversationStatusBadge } from '@/components/badges';
import { TimeAgo } from '@/components/time-ago';
import { LiveRefresh } from '@/components/live-refresh';
import { Badge } from '@/components/ui/badge';

export const metadata = { title: 'Conversations' };
export const dynamic = 'force-dynamic';

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const filter = conversationFilterSchema.parse(await searchParams);
  const { items, total } = await listConversations(filter);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filter, page })) if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) p.set(k, String(v));
    return `/conversations${p.size ? `?${p}` : ''}`;
  };

  return (
    <>
      <PageHeader title="Conversations" description="Every email thread and chat session. New messages appear automatically." actions={<LiveRefresh types={['message.created', 'conversation.updated']} />} />
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" role="search">
        <label className="sr-only" htmlFor="q">Search</label>
        <Input id="q" name="q" placeholder="Search name, email, id or message text" defaultValue={filter.q ?? ''} />
        <label className="sr-only" htmlFor="channel">Channel</label>
        <NativeSelect id="channel" name="channel" defaultValue={filter.channel ?? ''}>
          <option value="">All channels</option>
          <option value="email">Email</option>
          <option value="chat">Chat</option>
        </NativeSelect>
        <label className="sr-only" htmlFor="status">Status</label>
        <NativeSelect id="status" name="status" defaultValue={filter.status ?? ''}>
          <option value="">All statuses</option>
          <option value="auto_replied">Auto-replied</option>
          <option value="escalated">Escalated</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </NativeSelect>
        <label className="sr-only" htmlFor="from">From date</label>
        <Input id="from" name="from" type="date" defaultValue={filter.from ?? ''} aria-label="From date" />
        <label className="sr-only" htmlFor="to">To date</label>
        <Input id="to" name="to" type="date" defaultValue={filter.to ?? ''} aria-label="To date" />
        <div className="flex gap-2">
          <Button type="submit">Filter</Button>
          <Button asChild variant="ghost"><Link href="/conversations">Clear</Link></Button>
        </div>
      </form>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-1/2">Last message</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No conversations match these filters.</TableCell></TableRow>
            )}
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/conversations/${encodeURIComponent(c.id)}`} className="font-medium hover:underline">{c.customerName || c.customer}</Link>
                  <p className="text-xs text-muted-foreground">{c.customer}</p>
                </TableCell>
                <TableCell><ChannelBadge channel={c.channel} /></TableCell>
                <TableCell className="space-x-1 whitespace-nowrap">
                  <ConversationStatusBadge status={c.status} />
                  {c.openEscalations > 0 && c.status !== 'escalated' && <Badge variant="destructive">{c.openEscalations} open</Badge>}
                </TableCell>
                <TableCell className="max-w-0"><p className="truncate text-muted-foreground">{c.preview}</p></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{c.assignee ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground"><TimeAgo iso={c.lastAt} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">{total} conversation{total === 1 ? '' : 's'} · page {filter.page} of {pages}</span>
        <span className="flex gap-2">
          {filter.page > 1 && <Button asChild variant="outline" size="sm"><Link href={qs(filter.page - 1)}>Previous</Link></Button>}
          {filter.page < pages && <Button asChild variant="outline" size="sm"><Link href={qs(filter.page + 1)}>Next</Link></Button>}
        </span>
      </nav>
    </>
  );
}
