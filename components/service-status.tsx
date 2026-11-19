'use client';
import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/status-light';
import type { ServiceStatus } from '@/lib/health';
import { api } from '@/components/api';

/** One light per service: green Connected, yellow Check needed, red Not connected. Never a key. */
export function ServiceStatusList() {
  const [items, setItems] = React.useState<ServiceStatus[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async (fresh: boolean) => {
    setBusy(true);
    try { setItems((await api<{ services: ServiceStatus[] }>('GET', `/api/status${fresh ? '?fresh=1' : ''}`)).services); } catch { /* keep old */ } finally { setBusy(false); }
  }, []);
  React.useEffect(() => { load(false); }, [load]);
  return (
    <div>
      <ul className="divide-y" data-testid="service-status">
        {(items ?? []).map((s) => (
          <li key={s.id} className="flex flex-wrap items-start gap-3 py-3">
            <StatusDot light={s.light} className="mt-1.5" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.name} <span className="font-normal text-muted-foreground">· {s.what}</span></p>
              <p className="text-sm text-muted-foreground">{s.detail}</p>
            </div>
            <span className={s.light === 'green' ? 'font-semibold text-success' : s.light === 'yellow' ? 'font-semibold text-foreground' : 'font-semibold text-destructive'}>{s.label}</span>
          </li>
        ))}
        {!items ? <li className="py-3 text-muted-foreground">Checking each service…</li> : null}
      </ul>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => load(true)} disabled={busy}>
        <RefreshCw className={busy ? 'animate-spin' : ''} /> Check again
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">Keys are read from the .env file on the server and are never shown here. To connect a service, add its key to .env and restart.</p>
    </div>
  );
}
