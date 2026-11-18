'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Radio } from 'lucide-react';

/**
 * Subscribes to /api/events/stream (SSE) and refreshes the server-rendered page when a
 * relevant event arrives. EventSource reconnects automatically with Last-Event-ID.
 */
export function LiveRefresh({ conversationId, types }: { conversationId?: string; types?: string[] }) {
  const router = useRouter();
  const [state, setState] = React.useState<'connecting' | 'live' | 'offline'>('connecting');
  React.useEffect(() => {
    const es = new EventSource('/api/events/stream');
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onEvent = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { type: string; conversationId: string | null };
        if (conversationId && data.conversationId !== conversationId) return;
        if (types && !types.includes(data.type)) return;
      } catch {
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    es.addEventListener('open', () => setState('live'));
    es.addEventListener('error', () => setState(es.readyState === EventSource.CLOSED ? 'offline' : 'connecting'));
    es.addEventListener('update', onEvent as EventListener);
    return () => {
      if (timer) clearTimeout(timer);
      es.close();
    };
  }, [router, conversationId, types]);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      <Radio className={state === 'live' ? 'size-3.5 text-success' : 'size-3.5'} aria-hidden />
      {state === 'live' ? 'Live' : state === 'connecting' ? 'Connecting…' : 'Offline'}
    </span>
  );
}
