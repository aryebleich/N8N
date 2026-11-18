'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChannelBadge, ConfidenceValue, EscalationStatusBadge, PriorityBadge, ReasonBadge } from '@/components/badges';
import { SlaTimer, TimeAgo } from '@/components/time-ago';
import { useAction, useApi } from '@/components/csrf';
import type { EscalationItem } from '@/lib/escalations';

export function EscalationQueue({ items, users, currentUserId }: { items: EscalationItem[]; users: { id: string; label: string }[]; currentUserId: string }) {
  const api = useApi();
  const router = useRouter();
  const { pending, run } = useAction();
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [assignee, setAssignee] = React.useState(currentUserId);
  React.useEffect(() => setSelected((s) => new Set([...s].filter((id) => items.some((i) => i.id === id)))), [items]);
  const ids = [...selected];
  const all = items.length > 0 && selected.size === items.length;
  const bulk = (body: Record<string, unknown>, msg: string) => run(async () => { await api('PATCH', '/api/escalations', { ...body, ids }); setSelected(new Set()); router.refresh(); return true; }, msg);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5" role="toolbar" aria-label="Bulk actions">
        <span className="px-1 text-sm tabular-nums">{selected.size} selected</span>
        <Button size="sm" disabled={!ids.length || pending} onClick={() => bulk({ action: 'resolve' }, `Resolved ${ids.length}`)}>Resolve</Button>
        <NativeSelect className="h-8 w-48" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assign to">
          <option value="">Unassigned</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.id === currentUserId ? `${u.label} (me)` : u.label}</option>)}
        </NativeSelect>
        <Button size="sm" variant="outline" disabled={!ids.length || pending} onClick={() => bulk({ action: 'assign', assigneeId: assignee || null }, `Assigned ${ids.length}`)}>Assign</Button>
        <NativeSelect className="h-8 w-40" defaultValue="" aria-label="Set priority" disabled={!ids.length || pending} onChange={(e) => { if (e.target.value) { bulk({ action: 'priority', priority: e.target.value }, 'Priority updated'); e.target.value = ''; } }}>
          <option value="">Set priority…</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
        </NativeSelect>
        <NativeSelect className="h-8 w-40" defaultValue="" aria-label="Set status" disabled={!ids.length || pending} onChange={(e) => { if (e.target.value) { bulk({ action: 'status', status: e.target.value }, 'Status updated'); e.target.value = ''; } }}>
          <option value="">Set status…</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option>
        </NativeSelect>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"><input type="checkbox" aria-label="Select all" className="size-4 accent-[var(--primary)]" checked={all} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} /></TableHead>
              <TableHead>#</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Claude / Gemini</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">Nothing in this queue.</TableCell></TableRow>}
            {items.map((e) => (
              <TableRow key={e.id} data-state={selected.has(e.id) ? 'selected' : undefined}>
                <TableCell><input type="checkbox" aria-label={`Select escalation ${e.id}`} className="size-4 accent-[var(--primary)]" checked={selected.has(e.id)} onChange={(ev) => { const s = new Set(selected); if (ev.target.checked) s.add(e.id); else s.delete(e.id); setSelected(s); }} /></TableCell>
                <TableCell className="whitespace-nowrap">
                  {e.conversationId && !e.conversationId.startsWith('execution:') ? <Link className="font-medium hover:underline" href={`/conversations/${encodeURIComponent(e.conversationId)}`}>#{e.id}</Link> : <span className="font-medium">#{e.id}</span>}
                  <div className="mt-0.5"><ChannelBadge channel={e.channel === 'system' ? null : e.channel} /></div>
                </TableCell>
                <TableCell><EscalationStatusBadge status={e.status} /></TableCell>
                <TableCell><PriorityBadge priority={e.priority} /></TableCell>
                <TableCell className="max-w-64"><ReasonBadge code={e.reasonCode} /><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={e.reason}>{e.reason}</p></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{e.customer}</TableCell>
                <TableCell className="whitespace-nowrap"><ConfidenceValue value={e.claudeConfidence} /> / <ConfidenceValue value={e.geminiConfidence} /></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{e.assignee ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap"><SlaTimer dueAt={e.slaDueAt} status={e.status} /></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground"><TimeAgo iso={e.createdAt} suffix="" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
