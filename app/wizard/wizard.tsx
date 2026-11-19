'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, FlaskConical } from 'lucide-react';
import { api, useAction } from '@/components/api';
import { Field } from '@/components/help';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DAY_KEYS, DAY_LABELS, type Settings } from '@/lib/settings-schema';
import { cn } from '@/lib/utils';
import type { TestResult } from '@/lib/assistant';

const STEPS = ['Your company', 'Business hours', 'Answers', 'Try it'];

export function Wizard({ initial, answerCount }: { initial: Pick<Settings, 'company_name' | 'support_from_email' | 'business_hours'>; answerCount: number }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [step, setStep] = React.useState(0);
  const [company, setCompany] = React.useState(initial.company_name === 'Northwind Goods' ? '' : initial.company_name);
  const [email, setEmail] = React.useState(initial.support_from_email);
  const [bh, setBh] = React.useState(initial.business_hours);
  const [answers, setAnswers] = React.useState<'keep' | 'remove'>(answerCount ? 'keep' : 'keep');
  const [message, setMessage] = React.useState('How long does shipping take?');
  const [result, setResult] = React.useState<TestResult | null>(null);
  const timezones = React.useMemo(() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return [bh.timezone]; } }, [bh.timezone]);

  React.useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && initial.business_hours.timezone === 'America/New_York') setBh((b) => ({ ...b, timezone: tz }));
    } catch { /* keep default */ }
  }, [initial.business_hours.timezone]);

  const next = () => run(async () => {
    if (step === 0) await api('POST', '/api/wizard', { step: 'company', data: { company_name: company, support_from_email: email } });
    if (step === 1) await api('POST', '/api/wizard', { step: 'hours', data: { business_hours: bh } });
    if (step === 2) await api('POST', '/api/answers/sample', { action: answers === 'keep' ? 'add' : 'remove' });
    setStep((s) => s + 1);
  });
  const finish = () => run(async () => { await api('POST', '/api/wizard', { step: 'finish', data: {} }); router.push('/'); router.refresh(); }, 'All set! Your assistant is ready.');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome! Let&apos;s set up your support assistant</h1>
        <p className="mt-1 text-muted-foreground">Four short steps. You can change everything later.</p>
      </div>
      <ol className="grid grid-cols-4 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={cn('rounded-lg border p-2 text-center text-sm font-medium', i === step ? 'border-primary bg-primary text-primary-foreground' : i < step ? 'bg-success/15' : 'bg-card')}>
            <span className="block text-xs opacity-80">Step {i + 1}</span>{s}
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="space-y-5 p-6">
          {step === 0 ? (
            <>
              <h2 className="text-xl font-semibold">What is your company called?</h2>
              <Field label="Company name" htmlFor="w-company" help="Used in greetings, email signatures and the chat window." what="The assistant introduces itself with this name and signs emails with it." example="Northwind Goods">
                <Input id="w-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Your company name" autoFocus maxLength={120} />
              </Field>
              <Field label="Support email address (optional)" htmlFor="w-email" help="The address customers write to and see on replies." what="Replies are sent from (and answered to) this address." example="support@northwind.example">
                <Input id="w-email" type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="support@yourcompany.com" />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 className="text-xl font-semibold">When are you open?</h2>
              <label className="flex items-center gap-3 font-medium"><Switch checked={bh.enabled} onCheckedChange={(enabled) => setBh({ ...bh, enabled })} /> Only answer automatically during business hours</label>
              <p className="text-sm text-muted-foreground">{bh.enabled ? 'Outside these hours customers get a “we are closed” message and a person replies later.' : 'Off: the assistant answers around the clock. Most shops start like this.'}</p>
              {bh.enabled ? (
                <>
                  <NativeSelect value={bh.timezone} onChange={(e) => setBh({ ...bh, timezone: e.target.value })} aria-label="Time zone" className="max-w-sm">
                    {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </NativeSelect>
                  <div className="space-y-2">
                    {DAY_KEYS.map((d) => {
                      const h = bh.days[d];
                      return (
                        <div key={d} className="flex flex-wrap items-center gap-3">
                          <span className="w-28 font-medium">{DAY_LABELS[d]}</span>
                          <Switch checked={!!h} onCheckedChange={(v) => setBh({ ...bh, days: { ...bh.days, [d]: v ? ['09:00', '17:00'] : null } })} aria-label={`Open on ${DAY_LABELS[d]}`} />
                          {h ? (
                            <>
                              <Input type="time" value={h[0]} onChange={(e) => setBh({ ...bh, days: { ...bh.days, [d]: [e.target.value, h[1]] } })} className="w-32" aria-label={`${DAY_LABELS[d]} opens at`} />
                              <span>to</span>
                              <Input type="time" value={h[1]} onChange={(e) => setBh({ ...bh, days: { ...bh.days, [d]: [h[0], e.target.value] } })} className="w-32" aria-label={`${DAY_LABELS[d]} closes at`} />
                            </>
                          ) : <span className="text-muted-foreground">Closed</span>}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 className="text-xl font-semibold">Start with sample answers?</h2>
              <p>The assistant only answers from your answers. We have prepared 12 sample answers for a small online shop (shipping, returns, payments…) so you can try it straight away.</p>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
                {([['keep', 'Use the 12 sample answers', 'Good for trying things out. Edit or delete them later on the Answers page.'], ['remove', 'Start with no answers', 'Remove the samples. Add your own answers or import a spreadsheet afterwards.']] as const).map(([id, label, help]) => (
                  <button key={id} type="button" role="radio" aria-checked={answers === id} onClick={() => setAnswers(id)} className={cn('rounded-xl border-2 p-4 text-left', answers === id ? 'border-primary bg-accent' : 'hover:bg-muted')}>
                    <span className="flex items-center gap-2 font-semibold">{answers === id ? <Check className="size-5 text-primary" /> : null}{label}</span>
                    <span className="block text-sm text-muted-foreground">{help}</span>
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">Have a spreadsheet already? After setup, go to Answers → Import a spreadsheet.</p>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h2 className="text-xl font-semibold">Send a test message</h2>
              <p>Ask a question like a customer would. Nothing is sent to anyone.</p>
              <div className="flex flex-wrap gap-2">
                <Input value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Test message" className="min-w-0 flex-1" />
                <Button onClick={() => run(async () => setResult(await api<TestResult>('POST', '/api/test', { message, channel: 'chat', live: false })))} disabled={pending || !message.trim()}><FlaskConical /> Ask</Button>
              </div>
              {result ? (
                <div className="space-y-2 rounded-lg bg-muted p-4" data-testid="wizard-result">
                  <p className="font-semibold">{result.decision.auto ? '✅ It would answer automatically.' : '🙋 It would ask a person for help.'} <span className="font-normal">{result.why.text}</span></p>
                  <p className="whitespace-pre-wrap rounded-md bg-card p-3">{result.customerWouldGet}</p>
                  {result.engines.claude === 'simulator' ? <p className="text-sm text-muted-foreground">This used the offline simulator because no AI keys are in .env yet.</p> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {step > 0 ? <Button variant="outline" size="lg" onClick={() => setStep(step - 1)}><ArrowLeft /> Back</Button> : <span />}
        {step < 3 ? (
          <Button size="lg" onClick={next} disabled={pending || (step === 0 && !company.trim())} data-testid="wizard-next">Next <ArrowRight /></Button>
        ) : (
          <Button size="lg" variant="success" onClick={finish} disabled={pending} data-testid="wizard-finish"><Check /> Finish and go to Home</Button>
        )}
      </div>
      <p className="text-center text-sm"><Link href="/" onClick={(e) => { e.preventDefault(); finish(); }} className="text-muted-foreground underline">Skip setup for now</Link></p>
    </div>
  );
}
