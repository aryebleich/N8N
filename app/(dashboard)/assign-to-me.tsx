'use client';
import { useRouter } from 'next/navigation';
import { UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAction, useApi } from '@/components/csrf';

export function AssignToMeButton({ id, userId }: { id: number; userId: string }) {
  const api = useApi();
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => run(async () => { await api('PATCH', '/api/escalations', { action: 'assign', ids: [id], assigneeId: userId }); router.refresh(); }, `Escalation #${id} is yours`)}
    >
      <UserCheck aria-hidden /> Assign to me
    </Button>
  );
}
