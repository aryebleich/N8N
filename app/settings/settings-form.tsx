'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, Send } from 'lucide-react';
import { api, savedWithUndo, useAction } from '@/components/api';
import { ConfirmDialog } from '@/components/confirm';
import { CopyButton } from '@/components/copy-button';
import { Field, WhatDoesThisDo } from '@/components/help';
import { TagsInput } from '@/components/tags-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { DAY_KEYS, DAY_LABELS, levelName, levelToSlider, sliderToLevel, type Settings } from '@/lib/settings-schema';
import { autoShareSentence } from '@/lib/threshold-preview';
import type { DecisionSample } from '@/lib/metrics';

const SENDER_RE = /^(@[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[a-z0-9.-]+\.[a-z]{2,})$/;

function ConfidenceSlider({ id, label, level, onChange, samples, channel }: { id: string; label: string; level: number; onChange: (l: number) => void; samples: DecisionSample[]; channel?: 'email' | 'chat' }) {
  return (
    <div className="space-y-3 rounded-lg bg-muted/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold" id={`${id}-label`}>{label}</span>
        <span className="font-semibold text-primary">{levelName(level)} · both AIs must be {Math.round(level * 100)}% sure</span>
      </div>
      <Slider aria-labelledby={`${id}-label`} aria-label={label} min={0} max={100} step={5} value={[levelToSlider(level)]} onValueChange={([v]) => onChange(sliderToLevel(v))} data-testid={`${id}-slider`} />
      <div className="flex justify-between text-sm text-muted-foreground"><span>Careful: asks a person more often</span><span>Confident: answers more by itself</span></div>
      <p className="text-sm" aria-live="polite" data-testid={`${id}-note`}>{autoShareSentence(level, samples, channel)}</p>
    </div>
  );
}

export function SettingsForm({ initial, samples, widgetCode, widgetReady, slackReady }: { initial: Settings; samples: DecisionSample[]; widgetCode: string; widgetReady: boolean; slackReady: boolean }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [s, setS] = React.useState(initial);
  const [split, setSplit] = React.useState(initial.confidence_threshold_email != null || initial.confidence_threshold_chat != null);
  const [confirmOff, setConfirmOff] = React.useState(false);
  const set = (p: Partial<Settings>) => setS((x) => ({ ...x, ...p }));
  const bh = s.business_hours;
  const setBh = (p: Partial<Settings['business_hours']>) => set({ business_hours: { ...bh, ...p } });
  const timezones = React.useMemo(() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return [bh.timezone]; } }, [bh.timezone]);

  const patch = React.useMemo(() => {
    const next: Partial<Settings> = { ...s };
    if (!split) { next.confidence_threshold_email = null; next.confidence_threshold_chat = null; }
    return Object.fromEntries(Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(initial[k as keyof Settings]))) as Partial<Settings>;
  }, [s, split, initial]);
  const dirty = Object.keys(patch).length > 0;
  const turningOff = (initial.auto_reply_email && patch.auto_reply_email === false) || (initial.auto_reply_chat && patch.auto_reply_chat === false);

  const save = () => run(async () => {
    const r = await api<{ previous: Partial<Settings> }>('PATCH', '/api/settings', patch);
    setConfirmOff(false);
    router.refresh();
    savedWithUndo('Settings saved.', () => api('PATCH', '/api/settings', r.previous), () => router.refresh());
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Confidence level</CardTitle>
            <WhatDoesThisDo what="Each reply is written by Claude and checked by Gemini. Both say how sure they are. The assistant only answers by itself when both are at least this sure; otherwise it asks a person." example="At 80%, a question your answers cover well (both AIs 90% sure) is answered automatically; an unusual one (60% sure) goes to you." />
          </div>
          <CardDescription>How sure the assistant must be before it answers without asking a person.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ConfidenceSlider id="main" label="All messages" level={s.confidence_threshold} onChange={(l) => set({ confidence_threshold: l })} samples={samples} />
          <label className="flex items-center gap-3 font-medium">
            <Switch checked={split} onCheckedChange={(v) => { setSplit(v); if (v) set({ confidence_threshold_email: s.confidence_threshold_email ?? s.confidence_threshold, confidence_threshold_chat: s.confidence_threshold_chat ?? s.confidence_threshold }); }} />
            Use different levels for email and chat
          </label>
          {split ? (
            <div className="grid gap-4 md:grid-cols-2">
              <ConfidenceSlider id="email" label="Email" level={s.confidence_threshold_email ?? s.confidence_threshold} onChange={(l) => set({ confidence_threshold_email: l })} samples={samples} channel="email" />
              <ConfidenceSlider id="chat" label="Chat" level={s.confidence_threshold_chat ?? s.confidence_threshold} onChange={(l) => set({ confidence_threshold_chat: l })} samples={samples} channel="chat" />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Channels</CardTitle><CardDescription>Turn automatic answers on or off for each way customers reach you.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {([['auto_reply_email', 'Answer emails automatically', 'When off, every email waits for a person; the customer gets a short holding message.'], ['auto_reply_chat', 'Answer chats automatically', 'When off, every chat waits for a person; the visitor is told someone will reply.']] as const).map(([key, label, help]) => (
            <div key={key} className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div>
                <p className="font-semibold">{label}</p>
                <p className="text-sm text-muted-foreground">{help}</p>
              </div>
              <Switch checked={s[key]} onCheckedChange={(v) => set({ [key]: v } as Partial<Settings>)} aria-label={label} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2"><CardTitle>Business hours</CardTitle><WhatDoesThisDo what="Outside these hours the assistant does not answer by itself. The customer gets your “we are closed” message and a person replies later." example="Closed on Sunday: a Sunday email gets “We are closed right now…”, and it waits for you on Monday." /></div>
          <CardDescription>When you are open. Turn this off to let the assistant answer around the clock.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 font-medium"><Switch checked={bh.enabled} onCheckedChange={(enabled) => setBh({ enabled })} /> Only answer automatically during business hours</label>
          {bh.enabled ? (
            <>
              <Field label="Time zone" htmlFor="tz" help="The time zone of your opening hours." what="The hours below are read in this time zone, wherever your customers are." example="America/New_York">
                <NativeSelect id="tz" value={bh.timezone} onChange={(e) => setBh({ timezone: e.target.value })} className="max-w-sm">
                  {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </NativeSelect>
              </Field>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px]" data-testid="hours-grid">
                  <thead><tr className="text-left text-sm text-muted-foreground"><th className="py-2">Day</th><th>Open</th><th>From</th><th>Until</th></tr></thead>
                  <tbody>
                    {DAY_KEYS.map((d) => {
                      const h = bh.days[d];
                      return (
                        <tr key={d} className="border-t">
                          <td className="py-2 font-medium">{DAY_LABELS[d]}</td>
                          <td><Switch checked={!!h} onCheckedChange={(v) => setBh({ days: { ...bh.days, [d]: v ? ['09:00', '17:00'] : null } })} aria-label={`Open on ${DAY_LABELS[d]}`} /></td>
                          <td>{h ? <Input type="time" value={h[0]} onChange={(e) => setBh({ days: { ...bh.days, [d]: [e.target.value, h[1]] } })} className="w-32" aria-label={`${DAY_LABELS[d]} opens at`} /> : <span className="text-muted-foreground">Closed</span>}</td>
                          <td>{h ? <Input type="time" value={h[1]} onChange={(e) => setBh({ days: { ...bh.days, [d]: [h[0], e.target.value] } })} className="w-32" aria-label={`${DAY_LABELS[d]} closes at`} /> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Field label="Message outside business hours" htmlFor="outside" help="What customers get when they write while you are closed." what="Sent right away to anyone who writes outside your hours. A person then replies when you open." example="Thanks for your message. We are closed right now and will reply on the next business day.">
                <Textarea id="outside" rows={3} value={bh.outside_message} onChange={(e) => setBh({ outside_message: e.target.value })} maxLength={500} />
              </Field>
              <Field label="Tell the team in Slack about messages outside business hours?" htmlFor="outside-mode" help="Choose whether a closed-hours message should alert your team." what="“No” keeps your Slack quiet at night; the messages still wait in Conversations. “Yes” alerts the team straight away." example="A shop that does not work weekends usually picks “No”.">
                <NativeSelect id="outside-mode" value={bh.outside_mode} onChange={(e) => setBh({ outside_mode: e.target.value as 'escalate' | 'holding' })} className="max-w-sm">
                  <option value="holding">No, just send the message above</option>
                  <option value="escalate">Yes, alert the team in Slack too</option>
                </NativeSelect>
              </Field>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Always ask a person</CardTitle><CardDescription>Messages from these senders, or with these words, never get an automatic answer.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <Field label="Blocked senders" htmlFor="senders" help="Email addresses or whole domains (start with @)." what="Emails from these senders are never answered by the assistant. They wait for a person (or are ignored by n8n if it filters them)." example="lawyer@example.com, @bigcustomer.com">
            <TagsInput id="senders" value={s.blocked_senders} onChange={(blocked_senders) => set({ blocked_senders })} placeholder="name@example.com or @example.com" validate={(t) => (SENDER_RE.test(t) ? null : 'Use an email address or @domain.com')} max={1000} />
          </Field>
          <Field label="Blocked words" htmlFor="words" help="If a message contains one of these, a person always handles it." what="A safety net for sensitive topics. The assistant does not even try to answer." example="lawyer, chargeback, cancel my account">
            <TagsInput id="words" value={s.blocked_keywords} onChange={(blocked_keywords) => set({ blocked_keywords })} placeholder="Type a word and press Enter" validate={(t) => (t.length >= 2 ? null : 'Use at least 2 letters')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Alerts and email</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <Field label="Slack channel" htmlFor="slack" help="Where the team is told that a customer needs a person." what="When the assistant asks for help, a short summary with a link to the conversation is posted here. The Slack key itself is in .env." example="#support">
            <div className="flex flex-wrap gap-2">
              <Input id="slack" value={s.slack_channel} onChange={(e) => set({ slack_channel: e.target.value.trim() })} placeholder="#support" className="max-w-xs" />
              <Button variant="outline" disabled={pending || !s.slack_channel} onClick={() => run(() => api('POST', '/api/slack-test', { channel: s.slack_channel }), 'Test message sent. Check the channel in Slack.')}><Send /> Send a test message</Button>
            </div>
            {!slackReady ? <p className="text-sm text-warning">Slack is not connected yet: add SLACK_BOT_TOKEN to the .env file.</p> : null}
          </Field>
          <Field label="Support email address" htmlFor="from" help="The address customers see and reply to." what="Used as the sender and reply-to address on email replies (unless SMTP_FROM is set in .env)." example="support@northwind.example">
            <Input id="from" type="email" value={s.support_from_email} onChange={(e) => set({ support_from_email: e.target.value.trim() })} placeholder="support@yourcompany.com" className="max-w-sm" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2"><CardTitle>Chat on your website</CardTitle><WhatDoesThisDo what="Paste this code into your website, just before </body>. A chat button appears in the corner and talks to your n8n workflow." example="In WordPress: Appearance → Theme File Editor → footer.php, or a “custom code” plugin." /></div>
          <CardDescription>Copy this code and paste it into every page of your website.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm" data-testid="widget-code">{widgetCode}</pre>
          <CopyButton value={widgetCode} label="Copy the code" />
          {!widgetReady ? <p className="text-sm text-warning">Set N8N_CHAT_WEBHOOK_URL in .env so the code points to your n8n chat webhook.</p> : null}
        </CardContent>
      </Card>

      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer p-5 text-lg font-semibold">Advanced</summary>
        <div className="grid gap-5 border-t p-5 md:grid-cols-2">
          <Field label="Claude model" htmlFor="cm" help="Which Claude model writes the answers." what="Leave as is unless you know you need another model." example="claude-sonnet-5-5">
            <Input id="cm" value={s.claude_model} onChange={(e) => set({ claude_model: e.target.value.trim() })} />
          </Field>
          <Field label="Gemini model" htmlFor="gm" help="Which Gemini model checks the answers." what="Leave as is unless you know you need another model." example="gemini-flash-latest">
            <Input id="gm" value={s.gemini_model} onChange={(e) => set({ gemini_model: e.target.value.trim() })} />
          </Field>
          <Field label="Longest reply (tokens)" htmlFor="mt" help="Upper limit for one answer. 1024 is about 700 words." what="Stops very long replies. Raise it only if answers get cut off." example="1024">
            <Input id="mt" type="number" min={256} max={16000} value={s.max_tokens} onChange={(e) => set({ max_tokens: Number(e.target.value) })} />
          </Field>
          <Field label="Wait for the AI (seconds)" htmlFor="to" help="How long to wait for Claude or Gemini before asking a person." what="If an AI takes longer than this, the message goes to a person so customers are not left waiting." example="30">
            <Input id="to" type="number" min={2} max={120} value={Math.round(s.request_timeout_ms / 1000)} onChange={(e) => set({ request_timeout_ms: Number(e.target.value) * 1000 })} />
          </Field>
        </div>
      </details>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-lg">
        <Button size="lg" onClick={() => (turningOff ? setConfirmOff(true) : save())} disabled={pending || !dirty} data-testid="save-settings"><Save /> {pending ? 'Saving…' : 'Save settings'}</Button>
        {dirty ? <Button variant="ghost" onClick={() => { setS(initial); setSplit(initial.confidence_threshold_email != null || initial.confidence_threshold_chat != null); }}>Discard changes</Button> : <span className="text-sm text-muted-foreground">All changes are saved.</span>}
      </div>
      <ConfirmDialog open={confirmOff} onOpenChange={setConfirmOff} busy={pending} confirmLabel="Yes, save"
        explanation="You are turning off automatic answers for a channel. Every new message there will wait for a person until you turn it back on."
        onConfirm={save} />
    </div>
  );
}
