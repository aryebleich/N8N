'use client';
import * as React from 'react';
import { CheckCircle2, CircleAlert, FlaskConical, Send, ShieldCheck, Timer, UserRound } from 'lucide-react';
import { api, useAction } from '@/components/api';
import { ConfirmDialog } from '@/components/confirm';
import { WhatDoesThisDo } from '@/components/help';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { AiSummary, TestResult } from '@/lib/assistant';

export const SAMPLE_QUESTIONS = [
  'How long does shipping take?',
  'Can I return a kettle I bought 3 weeks ago?',
  'Do you ship to Canada?',
  'I want a refund and I am talking to my lawyer.',
  'What is the meaning of life?',
];

function AiCard({ ai }: { ai: AiSummary }) {
  const pct = ai.confidence == null ? null : Math.round(ai.confidence * 100);
  return (
    <div className="space-y-2 rounded-xl border p-4" data-testid={`ai-${ai.name.toLowerCase()}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-semibold">{ai.name} <span className="text-sm font-normal text-muted-foreground">· {ai.role}</span></p>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ai.engine === 'real' ? 'bg-success/15 text-success' : 'bg-warning/25')}>{ai.engine === 'real' ? 'Real AI' : 'Offline simulator'}</span>
      </div>
      {ai.ok && pct != null ? (
        <>
          <p className="text-3xl font-bold">{pct}% sure</p>
          <div className="h-3 overflow-hidden rounded-full bg-muted"><div className={cn('h-full', pct >= 80 ? 'bg-success' : pct >= 60 ? 'bg-warning' : 'bg-destructive')} style={{ width: `${pct}%` }} /></div>
          {ai.name === 'Gemini' ? <p>{ai.agrees ? 'Agrees with the answer.' : 'Does not agree with the answer.'}</p> : null}
          {ai.needsHuman ? <p>Asked for a person.</p> : null}
          {ai.issues.length ? <p className="text-sm text-muted-foreground">{ai.issues.join(' ')}</p> : null}
        </>
      ) : (
        <p className="text-destructive">{ai.error || 'No usable reply.'}</p>
      )}
      <p className="text-xs text-muted-foreground">{ai.model}{ai.latencyMs ? ` · ${(ai.latencyMs / 1000).toFixed(1)} s` : ''}</p>
    </div>
  );
}

export function TestCenter({ realClaude, realGemini, emailReady }: { realClaude: boolean; realGemini: boolean; emailReady: boolean }) {
  const { pending, run } = useAction();
  const [message, setMessage] = React.useState('');
  const [channel, setChannel] = React.useState<'email' | 'chat'>('email');
  const [live, setLive] = React.useState(false);
  const [liveEmail, setLiveEmail] = React.useState('');
  const [confirmLive, setConfirmLive] = React.useState(false);
  const [result, setResult] = React.useState<TestResult | null>(null);

  const ask = () => run(async () => {
    setResult(null);
    setResult(await api<TestResult>('POST', '/api/test', { message, channel, live, liveEmail: live ? liveEmail : '' }));
  });

  return (
    <div className="space-y-6">
      {live ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border-2 border-destructive bg-destructive/10 p-4 font-medium" data-testid="mode-banner">
          <CircleAlert className="mt-0.5 size-6 shrink-0 text-destructive" /> Live mode: a real email is sent to the address you typed, and a real Slack alert if a person is needed.
        </div>
      ) : (
        <div role="status" className="flex items-start gap-3 rounded-xl border-2 border-success bg-success/10 p-4 font-medium" data-testid="mode-banner">
          <ShieldCheck className="mt-0.5 size-6 shrink-0 text-success" /> Test mode: nothing is sent to real customers.
        </div>
      )}

      {!realClaude || !realGemini ? (
        <p className="rounded-lg bg-warning/20 p-3 text-sm">
          {!realClaude && !realGemini ? 'Claude and Gemini are' : !realClaude ? 'Claude is' : 'Gemini is'} not connected, so the <strong>offline simulator</strong> stands in. It only looks at your answers and gives rough scores. Add the keys to .env for real results.
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="msg" className="text-base font-semibold">Customer message</Label>
            <Textarea id="msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type a question like a customer would…" maxLength={4000} />
          </div>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">Or try one of these:</p>
            <div className="flex flex-wrap gap-2" data-testid="samples">
              {SAMPLE_QUESTIONS.map((q) => <Button key={q} variant="outline" size="sm" onClick={() => setMessage(q)}>{q}</Button>)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <fieldset className="flex items-center gap-4">
              <legend className="sr-only">Channel</legend>
              {(['email', 'chat'] as const).map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 text-base font-medium">
                  <input type="radio" name="channel" value={c} checked={channel === c} onChange={() => setChannel(c)} className="size-5 accent-[var(--primary)]" />
                  {c === 'email' ? 'Email' : 'Chat'}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-3 font-medium">
              <Switch checked={live} onCheckedChange={(v) => (v ? setConfirmLive(true) : setLive(false))} data-testid="live-switch" /> Live mode
            </label>
            <WhatDoesThisDo what="Test mode only shows you what would happen. Live mode really sends the reply by email to the address you type (use your own), and posts a real Slack alert when a person would be needed." example="Turn on Live mode, type your own email, ask “How long does shipping take?” and check your inbox." />
          </div>
          {live ? (
            <div className="space-y-1">
              <Label htmlFor="live-email">Send the reply to (your own email)</Label>
              <Input id="live-email" type="email" value={liveEmail} onChange={(e) => setLiveEmail(e.target.value.trim())} placeholder="you@yourcompany.com" className="max-w-sm" />
              {!emailReady ? <p className="text-sm text-warning">Email sending is not set up in .env, so no email will actually go out.</p> : null}
            </div>
          ) : null}
          <Button size="lg" onClick={ask} disabled={pending || !message.trim() || (live && !liveEmail)} data-testid="ask"><FlaskConical /> {pending ? 'Asking…' : 'Ask the assistant'}</Button>
        </CardContent>
      </Card>

      {result ? (
        <div className="space-y-4" aria-live="polite" data-testid="result">
          <Card className={result.decision.auto ? 'border-2 border-success' : 'border-2 border-warning'}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
                {result.decision.auto ? <><Send className="size-7 text-success" /> It would answer automatically</> : <><UserRound className="size-7 text-warning" /> It would ask a person for help</>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-lg"><span className="font-semibold">Why: </span>{result.decision.auto ? '' : `${result.why.title}. `}{result.why.text}</p>
              <p className="text-muted-foreground">Your confidence level for {channel}: both AIs must be at least {Math.round(result.decision.threshold * 100)}% sure.</p>
              <p className={cn('flex items-center gap-2 font-medium', result.under10s ? 'text-success' : 'text-warning')} data-testid="response-time">
                {result.under10s ? <CheckCircle2 className="size-5" /> : <Timer className="size-5" />} Response time: {(result.responseMs / 1000).toFixed(1)} seconds{result.under10s ? ' (under 10 seconds)' : ' (slower than 10 seconds)'}
              </p>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <AiCard ai={result.claude} />
            <AiCard ai={result.gemini} />
          </div>
          <Card>
            <CardHeader><CardTitle>What the customer would get</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-wrap rounded-lg bg-muted p-4" data-testid="customer-reply">{result.customerWouldGet}</p>
              {result.faqUsed.length ? <p className="text-sm text-muted-foreground">Answers it looked at: {result.faqUsed.map((f) => `“${f.question}”`).join(', ')}</p> : <p className="text-sm text-muted-foreground">None of your answers matched this question.</p>}
              {result.live.mode ? (
                <ul className="list-disc pl-5 text-sm">
                  {result.live.emailedTo ? <li>Email sent to {result.live.emailedTo}.</li> : null}
                  {result.live.slackPosted ? <li>Slack alert posted.</li> : null}
                  {result.live.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              ) : null}
              <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Technical details</summary><ul className="mt-2 list-disc pl-5">{result.decision.reasons.map((r) => <li key={r}>{r}</li>)}{!result.decision.reasons.length ? <li>All checks passed.</li> : null}</ul></details>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <ConfirmDialog open={confirmLive} onOpenChange={setConfirmLive} variant="destructive" confirmLabel="Yes, use Live mode" title="Turn on Live mode?"
        explanation="In Live mode the reply is really sent by email to the address you type, and a real Slack alert is posted when a person would be needed. Use your own email address, not a customer's."
        onConfirm={() => { setLive(true); setConfirmLive(false); }} />
    </div>
  );
}
