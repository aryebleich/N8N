import { requireUser, listAssignableUsers } from '@/lib/auth';
import { listEscalations } from '@/lib/escalations';
import { escalationFilterSchema, ESCALATION_STATUSES, PRIORITIES, REASON_CODES } from '@/lib/validators';
import { REASON_LABELS } from '@/lib/reason-labels';
import { PageHeader } from '@/components/page-header';
import { NativeSelect } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { LiveRefresh } from '@/components/live-refresh';
import { EscalationQueue } from './queue';

export const metadata = { title: 'Escalations' };
export const dynamic = 'force-dynamic';

export default async function EscalationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const f = escalationFilterSchema.parse(await searchParams);
  const [items, users] = await Promise.all([listEscalations(f), listAssignableUsers()]);
  return (
    <>
      <PageHeader title="Escalations" description="Conversations the models handed to a human. Sorted by priority, then SLA." actions={<LiveRefresh types={['escalation.created', 'escalation.updated', 'conversation.updated']} />} />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <NativeSelect name="status" defaultValue={f.status ?? ''} className="w-44" aria-label="Status">
          <option value="">Open and in progress</option>
          {ESCALATION_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </NativeSelect>
        <NativeSelect name="priority" defaultValue={f.priority ?? ''} className="w-36" aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </NativeSelect>
        <NativeSelect name="reason" defaultValue={f.reason ?? ''} className="w-48" aria-label="Reason">
          <option value="">Any reason</option>
          {REASON_CODES.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
        </NativeSelect>
        <NativeSelect name="assignee" defaultValue={f.assignee ?? ''} className="w-48" aria-label="Assignee">
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          <option value={user.id}>Me</option>
          {users.filter((u) => u.id !== user.id).map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </NativeSelect>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <EscalationQueue items={items} users={users.map((u) => ({ id: u.id, label: u.name || u.email }))} currentUserId={user.id} />
    </>
  );
}
