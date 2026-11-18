'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleAlert, CircleDashed, Plug } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAction, useApi } from '@/components/csrf';
import { TimeAgo } from '@/components/time-ago';
import type { StatusRow } from '@/lib/health';
import type { SecretInfo } from '@/lib/secrets';
import type { SecretName, Service } from '@/lib/validators';
import type { Settings } from '@/lib/settings-schema';

interface Props {
  services: { service: Service; label: string; status: StatusRow | null }[];
  secrets: SecretInfo[];
  config: { oracle: Settings['integration_oracle']; imap: Settings['integration_imap']; smtp: Settings['integration_smtp'] };
}

const SECRET_FOR: Partial<Record<Service, { name: SecretName; label: string }>> = {
  anthropic: { name: 'anthropic_api_key', label: 'Anthropic API key' },
  google: { name: 'google_ai_api_key', label: 'Google AI Studio API key' },
  slack: { name: 'slack_bot_token', label: 'Slack bot token (xoxb-…)' },
  oracle: { name: 'oracle_ords_password', label: 'ORDS password (read-only SUPPORT_RO)' },
  imap: { name: 'imap_password', label: 'IMAP password' },
  smtp: { name: 'smtp_password', label: 'SMTP password' },
};

const DESCRIPTIONS: Record<Service, string> = {
  turso: 'Conversations, FAQ, prompts, settings and logs. Configured with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.',
  oracle: 'Read-only customer accounts via ORDS. The test calls GET /support/health only.',
  anthropic: 'Claude drafts replies. The test checks that the key can see the configured model.',
  google: 'Gemini cross-checks drafts. The test checks that the key can see the configured model.',
  slack: 'Escalation alerts. The test calls auth.test.',
  imap: 'Inbox the n8n workflow reads. The test signs in and reads INBOX status (read-only).',
  smtp: 'Outgoing replies from this site. The test checks the login without sending mail.',
};

function StatusIcon({ s }: { s: StatusRow | null }) {
  if (!s || !s.last_checked_at) return <CircleDashed className="size-5 text-muted-foreground" aria-label="Never checked" />;
  const failing = s.last_error_at && (!s.last_success_at || s.last_error_at > s.last_success_at);
  return failing ? <CircleAlert className="size-5 text-destructive" aria-label="Failing" /> : <CheckCircle2 className="size-5 text-success" aria-label="Healthy" />;
}

export function IntegrationCards({ services, secrets, config }: Props) {
  const api = useApi();
  const router = useRouter();
  const test = useAction();
  const saver = useAction();
  const [results, setResults] = React.useState<Record<string, { ok: boolean; detail: string; error: string | null; latencyMs: number }>>({});
  const [secretInput, setSecretInput] = React.useState<Partial<Record<SecretName, string>>>({});
  const [oracle, setOracle] = React.useState(config.oracle);
  const [imap, setImap] = React.useState(config.imap);
  const [smtp, setSmtp] = React.useState(config.smtp);
  const secretInfo = new Map(secrets.map((s) => [s.name, s]));

  const saveService = (service: Service) =>
    saver.run(async () => {
      const sec = SECRET_FOR[service];
      const value = sec ? secretInput[sec.name] : undefined;
      if (sec && value) await api('PUT', '/api/integrations', { secrets: { [sec.name]: value } });
      if (service === 'oracle') await api('PUT', '/api/settings', { integration_oracle: oracle });
      if (service === 'imap') await api('PUT', '/api/settings', { integration_imap: imap });
      if (service === 'smtp') await api('PUT', '/api/settings', { integration_smtp: smtp });
      if (sec) setSecretInput((s) => ({ ...s, [sec.name]: '' }));
      router.refresh();
      return true;
    }, 'Saved');

  // Plain render function (not a component) so inputs keep focus while typing.
  const serverFields = (v: { host: string; port: number; secure: boolean; user: string }, set: (x: typeof v) => void, label: string) => (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2 grid gap-1"><Label htmlFor={`${label}-host`}>Host</Label><Input id={`${label}-host`} value={v.host} onChange={(e) => set({ ...v, host: e.target.value.trim() })} placeholder={`${label}.example.com`} /></div>
      <div className="grid gap-1"><Label htmlFor={`${label}-port`}>Port</Label><Input id={`${label}-port`} type="number" value={v.port} onChange={(e) => set({ ...v, port: Number(e.target.value) })} /></div>
      <label className="flex items-end gap-2 pb-2 text-sm"><Switch checked={v.secure} onCheckedChange={(x) => set({ ...v, secure: x })} /> TLS</label>
      <div className="col-span-2 grid gap-1"><Label htmlFor={`${label}-user`}>User</Label><Input id={`${label}-user`} value={v.user} onChange={(e) => set({ ...v, user: e.target.value.trim() })} autoComplete="off" /></div>
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {services.map(({ service, label, status }) => {
        const sec = SECRET_FOR[service];
        const info = sec ? secretInfo.get(sec.name) : undefined;
        const r = results[service];
        return (
          <Card key={service} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><StatusIcon s={status} /> {label}</CardTitle>
              <CardDescription>{DESCRIPTIONS[service]}</CardDescription>
            </CardHeader>
            <CardContent className="grid flex-1 content-start gap-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Last success</dt><dd><TimeAgo iso={status?.last_success_at ?? null} /></dd>
                <dt className="text-muted-foreground">Latency</dt><dd className="tabular-nums">{status?.last_latency_ms != null ? `${status.last_latency_ms} ms` : '—'}</dd>
                <dt className="text-muted-foreground">Last error</dt><dd className="break-words text-destructive">{status?.last_error ? <>{status.last_error} <span className="text-muted-foreground">(<TimeAgo iso={status.last_error_at} />)</span></> : <span className="text-muted-foreground">—</span>}</dd>
              </dl>
              {service === 'oracle' && (
                <div className="grid gap-2">
                  <div className="grid gap-1"><Label htmlFor="ords-url">ORDS base URL</Label><Input id="ords-url" value={oracle.base_url} onChange={(e) => setOracle({ ...oracle, base_url: e.target.value.trim() })} placeholder="https://…/ords/support_ro" /></div>
                  <div className="grid gap-1"><Label htmlFor="ords-user">Read-only user</Label><Input id="ords-user" value={oracle.user} onChange={(e) => setOracle({ ...oracle, user: e.target.value.trim() })} /></div>
                </div>
              )}
              {service === 'imap' && serverFields(imap, setImap, 'imap')}
              {service === 'smtp' && serverFields(smtp, setSmtp, 'smtp')}
              {sec && (
                <div className="grid gap-1">
                  <Label htmlFor={`secret-${service}`} className="flex items-center justify-between gap-2">
                    {sec.label}
                    {info?.last4 ? <Badge variant="secondary">•••• {info.last4}{info.source === 'environment' ? ' (env)' : ''}</Badge> : <Badge variant="destructive">not set</Badge>}
                  </Label>
                  <Input id={`secret-${service}`} type="password" autoComplete="new-password" value={secretInput[sec.name] ?? ''} onChange={(e) => setSecretInput({ ...secretInput, [sec.name]: e.target.value })} placeholder={info?.last4 ? 'Enter a new value to replace it' : 'Paste the key'} />
                </div>
              )}
              {r && (
                <p role="status" className={r.ok ? 'text-success' : 'break-words text-destructive'}>
                  {r.ok ? `✓ ${r.detail}` : `✕ ${r.error}`} <span className="text-muted-foreground">({r.latencyMs} ms)</span>
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {service !== 'turso' && service !== 'anthropic' && service !== 'google' && service !== 'slack' ? (
                  <Button size="sm" variant="outline" disabled={saver.pending} onClick={() => saveService(service)}>Save</Button>
                ) : sec ? (
                  <Button size="sm" variant="outline" disabled={saver.pending || !secretInput[sec.name]} onClick={() => saveService(service)}>Save key</Button>
                ) : null}
                <Button
                  size="sm"
                  disabled={test.pending}
                  onClick={() => test.run(async () => {
                    const out = await api<{ result: { ok: boolean; detail: string; error: string | null; latencyMs: number } }>('POST', '/api/integrations/test', { service });
                    setResults((x) => ({ ...x, [service]: out.result }));
                    router.refresh();
                  })}
                >
                  <Plug aria-hidden /> Test connection
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
