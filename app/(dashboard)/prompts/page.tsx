import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listPrompts } from '@/lib/prompts';
import { PROMPT_DEFS, PROMPT_IDS } from '@/lib/prompt-template';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TimeAgo } from '@/components/time-ago';

export const metadata = { title: 'Prompts' };
export const dynamic = 'force-dynamic';

export default async function PromptsPage() {
  await requireUser();
  const rows = await listPrompts();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return (
    <>
      <PageHeader title="Prompts" description="The text both models and customers see. Every save creates a new version; the workflow picks up changes within 30 seconds." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PROMPT_IDS.map((id) => {
          const r = byId.get(id);
          return (
            <Link key={id} href={`/prompts/${id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">{PROMPT_DEFS[id].name}<Badge variant="secondary">v{r?.version ?? '—'}</Badge></CardTitle>
                  <CardDescription>{PROMPT_DEFS[id].description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-3 font-mono text-xs text-muted-foreground">{r?.body ?? 'Missing: run the migrations.'}</p>
                  <p className="mt-3 text-xs text-muted-foreground">Updated <TimeAgo iso={r?.updated_at ?? null} /></p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
