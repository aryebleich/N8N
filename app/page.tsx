import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen, FlaskConical, MessagesSquare, Palette, Plus } from 'lucide-react';
import { getSettings } from '@/lib/settings';
import { latestNeedingPerson, todayNumbers, totalWaiting } from '@/lib/metrics';
import { timeAgo } from '@/lib/utils';
import { PageHeader } from '@/components/sidebar';
import { AssistantToggle } from '@/components/assistant-toggle';
import { ServiceStatusList } from '@/components/service-status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

function todaySentence(t: { total: number; email: number; chat: number; auto: number; waiting: number; done: number }) {
  if (t.total === 0) return 'No customers have written in yet today.';
  const who = t.total === 1 ? '1 customer wrote in' : `${t.total} customers wrote in`;
  const how = `(${t.email} by email, ${t.chat} by chat)`;
  const auto = t.auto === 0 ? 'none of them' : t.auto === t.total ? (t.total === 1 ? 'it' : 'all of them') : String(t.auto);
  const wait = t.waiting === 0 ? 'nobody is waiting for a person' : t.waiting === 1 ? '1 is waiting for a person' : `${t.waiting} are waiting for a person`;
  return `Today ${who} ${how}. The assistant answered ${auto} by itself${t.done ? `, you finished ${t.done}` : ''}, and ${wait}.`;
}

export default async function HomePage() {
  const settings = await getSettings(true);
  if (!settings.setup_complete) redirect('/wizard');
  const [today, waiting, latest] = await Promise.all([todayNumbers(), totalWaiting(), latestNeedingPerson(5)]);

  const sentence = todaySentence(today);

  return (
    <div className="space-y-6">
      <PageHeader title="Home" description={`Welcome back. Here is how the support assistant for ${settings.company_name} is doing.`} />
      <AssistantToggle enabled={settings.assistant_enabled} />

      <Card>
        <CardHeader><CardTitle className="text-xl">Today</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-lg" data-testid="today-sentence">{sentence}</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Customers', today.total, ''],
              ['Answered automatically', today.auto, 'text-success'],
              ['Waiting for a person', waiting, waiting ? 'text-warning' : ''],
              ['Finished by you', today.done, ''],
            ].map(([label, n, cls]) => (
              <div key={String(label)} className="rounded-lg bg-muted p-3">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className={`text-3xl font-bold ${cls}`}>{n}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-xl">Waiting for a person</CardTitle>
          {waiting > 5 ? <Button asChild variant="outline" size="sm"><Link href="/conversations?status=waiting">See all {waiting}</Link></Button> : null}
        </CardHeader>
        <CardContent>
          {latest.length ? (
            <ul className="divide-y" data-testid="needs-person">
              {latest.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.customer} <span className="font-normal text-muted-foreground">· {c.channel === 'email' ? 'Email' : 'Chat'} · {timeAgo(c.at)}</span></p>
                    <p className="truncate text-muted-foreground">{c.preview || '(no text)'}</p>
                    <p className="text-sm">Why: {c.why}</p>
                  </div>
                  <Button asChild><Link href={`/conversations/${encodeURIComponent(c.id)}`}>Open</Link></Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Nobody is waiting. Nice work!</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Quick actions</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button asChild size="lg" variant="outline" className="justify-start"><Link href="/answers?new=1"><Plus /> Add an answer</Link></Button>
          <Button asChild size="lg" variant="outline" className="justify-start"><Link href="/test"><FlaskConical /> Test the assistant</Link></Button>
          <Button asChild size="lg" variant="outline" className="justify-start"><Link href="/conversations?status=waiting"><MessagesSquare /> Reply to waiting customers</Link></Button>
          <Button asChild size="lg" variant="outline" className="justify-start"><Link href="/tone"><Palette /> Change the tone</Link></Button>
          <Button asChild size="lg" variant="outline" className="justify-start sm:col-span-2"><Link href="/answers"><BookOpen /> Look through your answers</Link></Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Connections</CardTitle></CardHeader>
        <CardContent><ServiceStatusList /></CardContent>
      </Card>
    </div>
  );
}
