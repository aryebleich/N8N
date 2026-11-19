'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Power } from 'lucide-react';
import { api, useAction } from '@/components/api';
import { ConfirmDialog } from '@/components/confirm';
import { cn } from '@/lib/utils';

/** The big ON/OFF switch. Turning it off asks first. */
export function AssistantToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [confirm, setConfirm] = React.useState(false);
  const set = (v: boolean) =>
    run(async () => { await api('PATCH', '/api/settings', { assistant_enabled: v }); setConfirm(false); router.refresh(); }, v ? 'The assistant is ON. It answers customers again.' : 'The assistant is OFF. Every message now goes to a person.');
  return (
    <>
      <button
        type="button" role="switch" aria-checked={enabled} disabled={pending} data-testid="assistant-toggle"
        onClick={() => (enabled ? setConfirm(true) : set(true))}
        className={cn('flex w-full items-center gap-5 rounded-2xl border-2 p-5 text-left transition-colors sm:p-6', enabled ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10')}
      >
        <span className={cn('flex size-16 shrink-0 items-center justify-center rounded-full text-white', enabled ? 'bg-success' : 'bg-destructive')}>
          <Power className="size-8" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-2xl font-bold">The assistant is {enabled ? 'ON' : 'OFF'}</span>
          <span className="block text-muted-foreground">
            {enabled ? 'It answers customers when it is sure, and asks a person when it is not. Click to turn it off.' : 'Every new message goes to a person; customers get a short "we will reply soon" message. Click to turn it on.'}
          </span>
        </span>
      </button>
      <ConfirmDialog
        open={confirm} onOpenChange={setConfirm} busy={pending} confirmLabel="Yes, turn it off"
        explanation="The assistant will stop answering customers by itself. Every new email and chat will wait for a person, and customers will get a short message saying someone will reply soon. You can turn it back on at any time."
        onConfirm={() => set(false)}
      />
    </>
  );
}
