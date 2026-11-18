'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Power, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { NativeSelect } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CopyButton } from '@/components/copy-button';
import { useAction, useApi } from '@/components/csrf';
import { CLAUDE_MODELS, DAY_KEYS, GEMINI_MODELS, type Settings } from '@/lib/settings-schema';
import { previewAutoSend } from '@/lib/threshold-preview';
import type { DecisionSample } from '@/lib/metrics';
import { formatDateTime } from '@/lib/utils';

interface Props {
  settings: Settings;
  updatedAt: Record<string, string>;
  samples: DecisionSample[];
  signature: string;
  urls: { chatWebhook: string; sendReply: string; escalate: string; widgetConfig: string };
  killLog: { key: string; value: boolean; by: string; at: string }[];
}

function useSaver() {
  const api = useApi();
  const router = useRouter();
  const { pending, run } = useAction();
  const save = (patch: Partial<Settings>, msg = 'Saved. n8n picks this up within 30 seconds.') =>
    run(async () => { await api('PUT', '/api/settings', patch); router.refresh(); return true; }, msg);
  return { pending, save };
}

function Section({ title, description, children, updated }: { title: string; description?: string; children: React.ReactNode; updated?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {updated && <p className="text-xs text-muted-foreground">Last changed {formatDateTime(updated)}</p>}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

export function SettingsForm({ settings, updatedAt, samples, signature, urls, killLog }: Props) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <KillSwitches settings={settings} killLog={killLog} />
      <Thresholds settings={settings} samples={samples} updated={updatedAt.confidence_threshold} />
      <Models settings={settings} updated={updatedAt.claude_model} />
      <BusinessHours settings={settings} updated={updatedAt.business_hours} />
      <BlockLists settings={settings} />
      <Slack settings={settings} />
      <Company settings={settings} signature={signature} urls={urls} />
    </div>
  );
}

function KillSwitches({ settings, killLog }: { settings: Settings; killLog: Props['killLog'] }) {
  const { pending, save } = useSaver();
  const [confirm, setConfirm] = React.useState<{ key: 'auto_reply_email' | 'auto_reply_chat'; value: boolean } | null>(null);
  const items = [
    { key: 'auto_reply_email' as const, label: 'Email auto-reply', on: settings.auto_reply_email },
    { key: 'auto_reply_chat' as const, label: 'Chat auto-reply', on: settings.auto_reply_chat },
  ];
  return (
    <Section title="Auto-reply kill switch" description="Off means every message on that channel goes to a human (with a holding reply). The models still draft, so agents can approve drafts.">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <button
            key={i.key}
            type="button"
            disabled={pending}
            onClick={() => setConfirm({ key: i.key, value: !i.on })}
            aria-pressed={i.on}
            className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-colors ${i.on ? 'border-success/60 bg-success/10' : 'border-destructive/60 bg-destructive/10'}`}
          >
            <Power className={`size-8 ${i.on ? 'text-success' : 'text-destructive'}`} aria-hidden />
            <span>
              <span className="block font-semibold">{i.label}</span>
              <span className="text-sm">{i.on ? 'ON · sending automatically' : 'OFF · escalating everything'}</span>
            </span>
          </button>
        ))}
      </div>
      {killLog.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent changes</p>
          <ul className="grid gap-0.5 text-xs text-muted-foreground">
            {killLog.map((k, i) => <li key={i}>{formatDateTime(k.at)} · {k.by} turned {k.key === 'auto_reply_email' ? 'email' : 'chat'} {k.value ? 'on' : 'off'}</li>)}
          </ul>
        </div>
      )}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn {confirm?.key === 'auto_reply_email' ? 'email' : 'chat'} auto-reply {confirm?.value ? 'on' : 'off'}?</DialogTitle>
            <DialogDescription>{confirm?.value ? 'Replies that pass both models and the threshold will be sent automatically again.' : 'Every new message on this channel will be escalated to your team with a holding reply. The change is logged.'}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant={confirm?.value ? 'default' : 'destructive'} disabled={pending} onClick={async () => { if (confirm) { await save({ [confirm.key]: confirm.value } as Partial<Settings>, `Auto-reply turned ${confirm.value ? 'on' : 'off'}`); setConfirm(null); } }}>
              Turn {confirm?.value ? 'on' : 'off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function ThresholdRow({ id, label, value, onChange, samples, channel, disabled }: { id: string; label: string; value: number; onChange: (v: number) => void; samples: DecisionSample[]; channel?: 'email' | 'chat'; disabled?: boolean }) {
  const p = previewAutoSend(samples, value, channel);
  return (
    <div className={disabled ? 'opacity-60' : ''}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} type="number" min={0} max={1} step={0.01} className="h-8 w-20 tabular-nums" value={value} disabled={disabled} onChange={(e) => onChange(Math.min(1, Math.max(0, Number(e.target.value))))} />
      </div>
      <Slider min={0} max={1} step={0.01} value={[value]} disabled={disabled} onValueChange={(v) => onChange(Math.round(v[0] * 100) / 100)} aria-label={label} />
      <p className="mt-1 text-sm" aria-live="polite" data-testid={`preview-${channel ?? 'all'}`}>
        {p.total === 0 ? <span className="text-muted-foreground">No decisions in the last 30 days to preview against.</span> : (
          <>At <strong className="tabular-nums">{value.toFixed(2)}</strong>, <strong className="tabular-nums">{p.wouldSend}</strong> of {p.total} recent {channel ?? ''} messages (<strong className="tabular-nums">{Math.round((p.share ?? 0) * 100)}%</strong>) would have been sent automatically.</>
        )}
      </p>
    </div>
  );
}

function Thresholds({ settings, samples, updated }: { settings: Settings; samples: DecisionSample[]; updated?: string }) {
  const { pending, save } = useSaver();
  const [global, setGlobal] = React.useState(settings.confidence_threshold);
  const [email, setEmail] = React.useState<number | null>(settings.confidence_threshold_email);
  const [chat, setChat] = React.useState<number | null>(settings.confidence_threshold_chat);
  const dirty = global !== settings.confidence_threshold || email !== settings.confidence_threshold_email || chat !== settings.confidence_threshold_chat;
  return (
    <Section title="Confidence threshold" description="Both models must reach this confidence (and agree) for a reply to go out automatically. Lower sends more automatically; higher sends more to humans." updated={updated}>
      <ThresholdRow id="th-global" label="Default threshold" value={global} onChange={setGlobal} samples={samples} />
      {(['email', 'chat'] as const).map((ch) => {
        const v = ch === 'email' ? email : chat;
        const set = ch === 'email' ? setEmail : setChat;
        return (
          <div key={ch} className="rounded-md border p-3">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Switch checked={v !== null} onCheckedChange={(on) => set(on ? global : null)} aria-label={`Separate threshold for ${ch}`} /> Separate threshold for {ch}
            </label>
            <ThresholdRow id={`th-${ch}`} label={`${ch === 'email' ? 'Email' : 'Chat'} threshold`} value={v ?? global} onChange={(x) => set(x)} samples={samples} channel={ch} disabled={v === null} />
          </div>
        );
      })}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={!dirty} onClick={() => { setGlobal(settings.confidence_threshold); setEmail(settings.confidence_threshold_email); setChat(settings.confidence_threshold_chat); }}>Reset</Button>
        <Button disabled={!dirty || pending} onClick={() => save({ confidence_threshold: global, confidence_threshold_email: email, confidence_threshold_chat: chat })}>Save thresholds</Button>
      </div>
    </Section>
  );
}

function ModelPicker({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  const custom = !options.includes(value);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={custom ? '__custom' : value} onChange={(e) => onChange(e.target.value === '__custom' ? '' : e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__custom">Other model id…</option>
      </NativeSelect>
      {custom && <Input aria-label={`${label} custom id`} value={value} placeholder="model id" onChange={(e) => onChange(e.target.value.trim())} />}
    </div>
  );
}

function Models({ settings, updated }: { settings: Settings; updated?: string }) {
  const { pending, save } = useSaver();
  const [f, setF] = React.useState({ claude_model: settings.claude_model, gemini_model: settings.gemini_model, max_tokens: settings.max_tokens, request_timeout_ms: settings.request_timeout_ms });
  const dirty = JSON.stringify(f) !== JSON.stringify({ claude_model: settings.claude_model, gemini_model: settings.gemini_model, max_tokens: settings.max_tokens, request_timeout_ms: settings.request_timeout_ms });
  return (
    <Section title="Models" description="Test a model change on the Prompts page before saving it here." updated={updated}>
      <div className="grid gap-4 sm:grid-cols-2">
        <ModelPicker id="claude-model" label="Claude (drafts)" value={f.claude_model} options={CLAUDE_MODELS} onChange={(v) => setF({ ...f, claude_model: v })} />
        <ModelPicker id="gemini-model" label="Gemini (reviews)" value={f.gemini_model} options={GEMINI_MODELS} onChange={(v) => setF({ ...f, gemini_model: v })} />
        <div className="grid gap-1.5"><Label htmlFor="max-tokens">Max tokens (Claude output)</Label><Input id="max-tokens" type="number" min={256} max={16000} value={f.max_tokens} onChange={(e) => setF({ ...f, max_tokens: Number(e.target.value) })} /></div>
        <div className="grid gap-1.5"><Label htmlFor="timeout">Request timeout (ms, email)</Label><Input id="timeout" type="number" min={2000} max={120000} step={1000} value={f.request_timeout_ms} onChange={(e) => setF({ ...f, request_timeout_ms: Number(e.target.value) })} /><p className="text-xs text-muted-foreground">Chat replies keep their own 8-second budget in n8n.</p></div>
      </div>
      <div className="flex justify-end"><Button disabled={!dirty || pending || !f.claude_model || !f.gemini_model} onClick={() => save(f)}>Save models</Button></div>
    </Section>
  );
}

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

function BusinessHours({ settings, updated }: { settings: Settings; updated?: string }) {
  const { pending, save } = useSaver();
  const [bh, setBh] = React.useState(settings.business_hours);
  const dirty = JSON.stringify(bh) !== JSON.stringify(settings.business_hours);
  return (
    <Section title="Business hours" description="Outside these hours the workflow never auto-replies." updated={updated}>
      <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={bh.enabled} onCheckedChange={(v) => setBh({ ...bh, enabled: v })} /> Use business hours</label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label htmlFor="tz">Time zone (IANA)</Label><Input id="tz" value={bh.timezone} onChange={(e) => setBh({ ...bh, timezone: e.target.value })} placeholder="America/New_York" /></div>
        <div className="grid gap-1.5">
          <Label htmlFor="outside">Outside hours</Label>
          <NativeSelect id="outside" value={bh.outside_mode} onChange={(e) => setBh({ ...bh, outside_mode: e.target.value as 'escalate' | 'holding' })}>
            <option value="holding">Send a holding reply (low priority, no Slack ping)</option>
            <option value="escalate">Escalate to the team now (Slack ping)</option>
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-1.5">
        {DAY_KEYS.map((d) => {
          const v = bh.days[d];
          return (
            <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-24 items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={v !== null} onChange={(e) => setBh({ ...bh, days: { ...bh.days, [d]: e.target.checked ? ['09:00', '17:00'] : null } })} /> {DAY_LABEL[d]}</label>
              {v ? (
                <>
                  <Input aria-label={`${DAY_LABEL[d]} opens`} type="time" className="h-8 w-28" value={v[0]} onChange={(e) => setBh({ ...bh, days: { ...bh.days, [d]: [e.target.value, v[1]] } })} />
                  <span>to</span>
                  <Input aria-label={`${DAY_LABEL[d]} closes`} type="time" className="h-8 w-28" value={v[1]} onChange={(e) => setBh({ ...bh, days: { ...bh.days, [d]: [v[0], e.target.value] } })} />
                </>
              ) : <span className="text-muted-foreground">Closed</span>}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end"><Button disabled={!dirty || pending} onClick={() => save({ business_hours: bh })}>Save business hours</Button></div>
    </Section>
  );
}

const lines = (s: string) => [...new Set(s.split('\n').map((l) => l.trim()).filter(Boolean))];

function BlockLists({ settings }: { settings: Settings }) {
  const { pending, save } = useSaver();
  const [senders, setSenders] = React.useState(settings.blocked_senders.join('\n'));
  const [keywords, setKeywords] = React.useState(settings.blocked_keywords.join('\n'));
  const dirty = senders !== settings.blocked_senders.join('\n') || keywords !== settings.blocked_keywords.join('\n');
  return (
    <Section title="Blocked senders and keywords" description="Blocked senders are ignored entirely (no reply, no escalation). Messages containing a blocked keyword are never auto-replied.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label htmlFor="senders">Blocked senders</Label><Textarea id="senders" rows={6} className="font-mono text-xs" value={senders} onChange={(e) => setSenders(e.target.value)} placeholder={'spam@example.com\n@bad-domain.com'} /><p className="text-xs text-muted-foreground">One per line: an email address or @domain.</p></div>
        <div className="grid gap-1.5"><Label htmlFor="keywords">Blocked keywords</Label><Textarea id="keywords" rows={6} className="font-mono text-xs" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={'chargeback\nlawyer\nlawsuit'} /><p className="text-xs text-muted-foreground">One per line, case-insensitive.</p></div>
      </div>
      <div className="flex justify-end"><Button disabled={!dirty || pending} onClick={() => save({ blocked_senders: lines(senders.toLowerCase()), blocked_keywords: lines(keywords) })}>Save lists</Button></div>
    </Section>
  );
}

function Slack({ settings }: { settings: Settings }) {
  const api = useApi();
  const { pending, save } = useSaver();
  const test = useAction();
  const [channel, setChannel] = React.useState(settings.slack_channel_id);
  const [sla, setSla] = React.useState(settings.sla_minutes);
  return (
    <Section title="Slack and SLAs" description="Escalations are posted to this channel. The bot token lives under Integrations.">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-48 flex-1 gap-1.5"><Label htmlFor="slack-channel">Slack channel ID</Label><Input id="slack-channel" value={channel} onChange={(e) => setChannel(e.target.value.trim())} placeholder="C0123456789" /></div>
        <Button disabled={pending || channel === settings.slack_channel_id} onClick={() => save({ slack_channel_id: channel })}>Save</Button>
        <Button variant="outline" disabled={test.pending || !settings.slack_channel_id} onClick={() => test.run(() => api('POST', '/api/settings/slack-test'), 'Test message posted to Slack')}><Send aria-hidden /> Send test message</Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['high', 'normal', 'low'] as const).map((p) => (
          <div key={p} className="grid gap-1.5"><Label htmlFor={`sla-${p}`}>SLA {p} (min)</Label><Input id={`sla-${p}`} type="number" min={5} value={sla[p]} onChange={(e) => setSla({ ...sla, [p]: Number(e.target.value) })} /></div>
        ))}
      </div>
      <div className="flex justify-end"><Button variant="outline" disabled={pending || JSON.stringify(sla) === JSON.stringify(settings.sla_minutes)} onClick={() => save({ sla_minutes: sla })}>Save SLAs</Button></div>
    </Section>
  );
}

function Company({ settings, signature, urls }: { settings: Settings; signature: string; urls: Props['urls'] }) {
  const { pending, save } = useSaver();
  const [name, setName] = React.useState(settings.company_name);
  const [from, setFrom] = React.useState(settings.support_from_email);
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-36 text-sm text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs" title={value}>{value}</code>
      <CopyButton value={value} />
    </div>
  );
  return (
    <Section title="Company and endpoints" description="Used in prompts, replies and the chat widget.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label htmlFor="company">Company name</Label><Input id="company" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
        <div className="grid gap-1.5"><Label htmlFor="from">Support from address</Label><Input id="from" type="email" value={from} onChange={(e) => setFrom(e.target.value.trim())} placeholder="support@example.com" /></div>
      </div>
      <div className="flex justify-end"><Button disabled={pending || (name === settings.company_name && from === settings.support_from_email) || !name.trim()} onClick={() => save({ company_name: name.trim(), support_from_email: from })}>Save</Button></div>
      <div className="grid gap-2 border-t pt-4">
        <div className="flex flex-wrap items-start gap-2">
          <span className="w-36 text-sm text-muted-foreground">Support signature</span>
          <pre className="min-w-0 flex-1 whitespace-pre-wrap rounded bg-muted px-2 py-1 text-xs">{signature}</pre>
          <CopyButton value={signature} />
        </div>
        <p className="text-xs text-muted-foreground">Edit the signature on the Prompts page (Email signature), with version history.</p>
        <Row label="Chat webhook (n8n)" value={urls.chatWebhook} />
        <Row label="send-reply endpoint" value={urls.sendReply} />
        <Row label="escalate endpoint" value={urls.escalate} />
        <Row label="Widget config" value={urls.widgetConfig} />
      </div>
    </Section>
  );
}
