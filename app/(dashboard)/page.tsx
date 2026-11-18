import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { dashboardStats, openEscalations, volumeByChannel, type WindowStats } from '@/lib/metrics';
import { getSettings } from '@/lib/settings';
import { conf, formatDuration, pct } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VolumeChart } from '@/components/volume-chart';
import { LiveRefresh } from '@/components/live-refresh';
import { ChannelBadge, PriorityBadge, ReasonBadge } from '@/components/badges';
import { TimeAgo, SlaTimer } from '@/components/time-ago';
import { AssignToMeButton } from './assign-to-me';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

function Stat({ label, d1, d7, format = (n: number | null) => String(n ?? 0) }: { label: string; d1: number | null; d7: number | null; format?: (n: number | null) => string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{format(d1)}</p>
      <p className="text-xs text-muted-foreground tabular-nums">7 days: {format(d7)}</p>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const [stats, volume, open, settings] = await Promise.all([dashboardStats(), volumeByChannel(14), openEscalations(8), getSettings()]);
  const a: WindowStats = stats.last24h;
  const b: WindowStats = stats.last7d;
  const killed = [!settings.auto_reply_email && 'email', !settings.auto_reply_chat && 'chat'].filter(Boolean);

  return (
    <>
      <PageHeader title="Dashboard" description="Last 24 hours, with the 7-day total underneath each number." actions={<LiveRefresh />} />
      {denied && <p role="alert" className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">That page is for owners only.</p>}
      {killed.length > 0 && (
        <p role="status" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          Auto-reply is <strong>off</strong> for {killed.join(' and ')}. Every message on that channel goes to a human.
          {user.role === 'owner' && <> <Link className="underline" href="/settings">Change in Settings</Link>.</>}
        </p>
      )}

      <section aria-label="Volume" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Messages received" d1={a.received} d7={b.received} />
        <Stat label="Auto-replied" d1={a.autoReplied} d7={b.autoReplied} />
        <Stat label="Escalated" d1={a.escalated} d7={b.escalated} />
        <Stat label="Failed" d1={a.failed} d7={b.failed} />
      </section>
      <section aria-label="Quality" className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Auto-reply rate" d1={a.autoRate} d7={b.autoRate} format={pct} />
        <Stat label="Escalation rate" d1={a.escalationRate} d7={b.escalationRate} format={pct} />
        <Stat label="Avg Claude confidence" d1={a.avgClaude} d7={b.avgClaude} format={conf} />
        <Stat label="Avg Gemini confidence" d1={a.avgGemini} d7={b.avgGemini} format={conf} />
        <Stat label="Median response time" d1={a.medianResponseMs} d7={b.medianResponseMs} format={formatDuration} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Messages by channel</CardTitle>
            <CardDescription>Customer messages per day, last 14 days (UTC).</CardDescription>
          </CardHeader>
          <CardContent><VolumeChart data={volume} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Open escalations <Badge variant="destructive">{open.length}</Badge></CardTitle>
            <CardDescription>Oldest first. <Link href="/escalations" className="underline">See the full queue</Link>.</CardDescription>
          </CardHeader>
          <CardContent>
            {open.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No open escalations. Everything is handled.</p>
            ) : (
              <ul className="divide-y">
                {open.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link href={e.conversationId ? `/conversations/${encodeURIComponent(e.conversationId)}` : '/escalations'} className="font-medium hover:underline">#{e.id}</Link>
                        <ChannelBadge channel={e.channel} />
                        <ReasonBadge code={e.reasonCode} />
                        <PriorityBadge priority={e.priority} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.customer} · age <TimeAgo iso={e.createdAt} suffix="" /> · SLA <SlaTimer dueAt={e.slaDueAt} status="open" />
                        {e.assignee && <> · {e.assignee}</>}
                      </p>
                    </div>
                    {e.assigneeId !== user.id && <AssignToMeButton id={e.id} userId={user.id} />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
