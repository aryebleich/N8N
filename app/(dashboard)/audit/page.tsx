import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { all, get } from '@/lib/db';
import { auditFilterSchema } from '@/lib/validators';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

const PAGE = 50;

function Json({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  let pretty = value;
  try { pretty = JSON.stringify(JSON.parse(value), null, 2); } catch { /* raw */ }
  const short = pretty.length > 140 ? `${pretty.slice(0, 140)}…` : pretty;
  return pretty.length > 140 ? (
    <details><summary className="cursor-pointer font-mono text-xs">{short.replace(/\s+/g, ' ')}</summary><pre className="mt-1 max-h-64 max-w-md overflow-auto rounded bg-muted/40 p-2 font-mono text-xs">{pretty}</pre></details>
  ) : <code className="font-mono text-xs">{pretty.replace(/\s+/g, ' ')}</code>;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireOwner();
  const f = auditFilterSchema.parse(await searchParams);
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.actor) { where.push('(a.actor_id = ? OR lower(a.actor_email) LIKE ?)'); args.push(f.actor, `%${f.actor.toLowerCase()}%`); }
  if (f.entity) { where.push('a.entity = ?'); args.push(f.entity); }
  if (f.action) { where.push('a.action LIKE ?'); args.push(`${f.action}%`); }
  if (f.from) { where.push('a.created_at >= ?'); args.push(`${f.from}T00:00:00.000Z`); }
  if (f.to) { where.push('a.created_at <= ?'); args.push(`${f.to}T23:59:59.999Z`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, total, entities] = await Promise.all([
    all<{ id: number; actor_id: string; actor_email: string | null; action: string; entity: string; entity_id: string | null; old_json: string | null; new_json: string | null; ip: string | null; created_at: string }>(
      `SELECT a.* FROM audit_log a ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...args, PAGE, (f.page - 1) * PAGE],
    ),
    get<{ n: number }>(`SELECT count(*) AS n FROM audit_log a ${w}`, args),
    all<{ entity: string }>('SELECT DISTINCT entity FROM audit_log ORDER BY entity'),
  ]);
  const pages = Math.max(1, Math.ceil(Number(total?.n ?? 0) / PAGE));
  const qs = (page: number) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...f, page })) if (v && !(k === 'page' && v === 1)) p.set(k, String(v)); return `/audit${p.size ? `?${p}` : ''}`; };

  return (
    <>
      <PageHeader title="Audit log" description="Every change made in this console and by n8n. Append-only: the database rejects edits and deletes." />
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Input name="actor" defaultValue={f.actor ?? ''} placeholder="Actor email or id" className="w-52" aria-label="Actor" />
        <NativeSelect name="entity" defaultValue={f.entity ?? ''} className="w-40" aria-label="Entity">
          <option value="">All entities</option>
          {entities.map((e) => <option key={e.entity} value={e.entity}>{e.entity}</option>)}
        </NativeSelect>
        <Input name="action" defaultValue={f.action ?? ''} placeholder="Action prefix, e.g. settings" className="w-56" aria-label="Action" />
        <Input name="from" type="date" defaultValue={f.from ?? ''} className="w-40" aria-label="From date" />
        <Input name="to" type="date" defaultValue={f.to ?? ''} className="w-40" aria-label="To date" />
        <Button type="submit" variant="outline">Filter</Button>
        <Button asChild variant="ghost"><Link href="/audit">Clear</Link></Button>
      </form>
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Old value</TableHead><TableHead>New value</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No entries.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id} className="align-top">
                <TableCell className="whitespace-nowrap text-xs tabular-nums">{formatDateTime(r.created_at)}</TableCell>
                <TableCell className="text-xs"><p>{r.actor_email ?? r.actor_id}</p>{r.ip && <p className="text-muted-foreground">{r.ip}</p>}</TableCell>
                <TableCell><code className="text-xs">{r.action}</code></TableCell>
                <TableCell className="text-xs">{r.entity}{r.entity_id && <span className="block max-w-48 truncate font-mono text-muted-foreground" title={r.entity_id}>{r.entity_id}</span>}</TableCell>
                <TableCell><Json value={r.old_json} /></TableCell>
                <TableCell><Json value={r.new_json} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">{total?.n ?? 0} entries · page {f.page} of {pages}</span>
        <span className="flex gap-2">
          {f.page > 1 && <Button asChild variant="outline" size="sm"><Link href={qs(f.page - 1)}>Previous</Link></Button>}
          {f.page < pages && <Button asChild variant="outline" size="sm"><Link href={qs(f.page + 1)}>Next</Link></Button>}
        </span>
      </nav>
    </>
  );
}
