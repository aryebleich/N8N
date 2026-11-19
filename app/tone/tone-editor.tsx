'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, Save } from 'lucide-react';
import { api, savedWithUndo, useAction } from '@/components/api';
import { ConfirmButton } from '@/components/confirm';
import { Field, WhatDoesThisDo } from '@/components/help';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { NEVER_RULES, TONE_PRESETS } from '@/lib/tone';
import { NEVER_RULE_IDS, type Settings } from '@/lib/settings-schema';
import { formatDateTime, cn } from '@/lib/utils';
import type { PromptId } from '@/lib/prompt-template';
import type { PromptVersion } from '@/lib/prompts';
import type { ToneSnapshot } from '@/lib/tone-admin';

type ToneForm = Pick<Settings, 'tone_style' | 'tone_custom' | 'never_rules' | 'never_custom' | 'company_name'> & { email_signature: string; chat_greeting: string; holding_message: string };

const STYLES = [
  ...(['friendly', 'professional', 'short'] as const).map((id) => ({ id, ...TONE_PRESETS[id] })),
  { id: 'custom' as const, label: 'Custom', description: 'Describe the tone in your own words.', example: 'Calm and reassuring, a little playful. Use British spelling.' },
];
const VERSION_NAMES: Record<PromptId, string> = {
  claude_system: 'Assistant instructions', gemini_reviewer: 'Checker instructions', holding_message: 'Message when a person needs to help', email_signature: 'Email signature', chat_greeting: 'Chat greeting',
};

export function ToneEditor({ initial, promptMode, instructions, versions }: { initial: ToneForm; promptMode: 'recommended' | 'custom'; instructions: string; versions: Record<PromptId, PromptVersion[]> }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [f, setF] = React.useState(initial);
  const [raw, setRaw] = React.useState(instructions);
  const [historyId, setHistoryId] = React.useState<PromptId>('claude_system');
  const set = (p: Partial<ToneForm>) => setF((x) => ({ ...x, ...p }));
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const undoTo = (before: ToneSnapshot) => () => api('POST', '/api/tone/undo', before);

  const save = () => run(async () => {
    const r = await api<{ before: ToneSnapshot }>('PUT', '/api/tone', f);
    router.refresh();
    savedWithUndo('Tone and rules saved.', undoTo(r.before), () => router.refresh());
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2"><CardTitle>Tone of voice</CardTitle><WhatDoesThisDo what="Sets how every reply sounds. The facts always come from your answers; only the style changes." example="Friendly: “Hi Ada, good news…”. Professional: “Thank you for your message…”." /></div>
          <CardDescription>Pick the style that sounds like your business.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Tone of voice">
            {STYLES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={f.tone_style === s.id} onClick={() => set({ tone_style: s.id })}
                className={cn('rounded-xl border-2 p-4 text-left transition-colors', f.tone_style === s.id ? 'border-primary bg-accent' : 'hover:bg-muted')}>
                <span className="flex items-center gap-2 text-lg font-semibold">{f.tone_style === s.id ? <Check className="size-5 text-primary" /> : null}{s.label}</span>
                <span className="block text-sm text-muted-foreground">{s.description}</span>
                <span className="mt-2 block rounded-md bg-card p-2 text-sm italic">“{s.example}”</span>
              </button>
            ))}
          </div>
          {f.tone_style === 'custom' ? (
            <Field label="Describe your tone" htmlFor="tone-custom" help="One rule per line." what="Your own style rules, in plain words. The assistant follows them for every reply." example={'Calm and reassuring.\nUse British spelling.\nNever more than 4 sentences.'}>
              <Textarea id="tone-custom" rows={4} value={f.tone_custom} onChange={(e) => set({ tone_custom: e.target.value })} maxLength={1000} />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your details</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <Field label="Company name" htmlFor="company" help="Used in greetings, signatures and the chat window." what="Wherever a message says {{company_name}}, this name is filled in." example="Northwind Goods">
            <Input id="company" value={f.company_name} onChange={(e) => set({ company_name: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Email signature" htmlFor="signature" help="Added to the end of every email reply." what="The closing lines under each email the assistant or you send. You can use {{company_name}}." example={'Best regards,\nThe {{company_name}} team'}>
            <Textarea id="signature" rows={3} value={f.email_signature} onChange={(e) => set({ email_signature: e.target.value })} maxLength={1000} />
          </Field>
          <Field label="Chat greeting" htmlFor="greeting" help="The first message visitors see when they open the chat." what="Shown in the chat window on your website before the visitor types anything." example="Hi! I'm the {{company_name}} assistant. How can I help?">
            <Input id="greeting" value={f.chat_greeting} onChange={(e) => set({ chat_greeting: e.target.value })} maxLength={500} />
          </Field>
          <Field label="Message when a person needs to help" htmlFor="holding" help="What the customer gets when the assistant asks a person instead." what="Sent right away when the assistant is not sure, so the customer knows someone will reply." example="Thanks for your message. A member of our team will get back to you shortly.">
            <Textarea id="holding" rows={3} value={f.holding_message} onChange={(e) => set({ holding_message: e.target.value })} maxLength={2000} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2"><CardTitle>Things the assistant must never do</CardTitle><WhatDoesThisDo what="Hard rules. If a customer asks for one of these, the assistant says a teammate will help and asks a person." example="A customer asks for a refund that is not in your answers: the assistant does not promise it." /></div>
          <CardDescription>Tick every rule you want. Add your own below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            {NEVER_RULE_IDS.map((id) => (
              <label key={id} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted">
                <input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={f.never_rules.includes(id)}
                  onChange={(e) => set({ never_rules: e.target.checked ? [...f.never_rules, id] : f.never_rules.filter((x) => x !== id) })} />
                <span>{NEVER_RULES[id].label}</span>
              </label>
            ))}
          </div>
          <Field label="Your own rules" htmlFor="never-custom" help="One rule per line." what="Anything else the assistant must never do or say." example={'Mention our old address on Main Street\nOffer free shipping'}>
            <Textarea id="never-custom" rows={3} value={f.never_custom} onChange={(e) => set({ never_custom: e.target.value })} maxLength={2000} />
          </Field>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-lg">
        <Button size="lg" onClick={save} disabled={pending || !dirty || !f.company_name.trim()}><Save /> {pending ? 'Saving…' : 'Save tone and rules'}</Button>
        {dirty ? <Button variant="ghost" onClick={() => setF(initial)}>Discard changes</Button> : <span className="text-sm text-muted-foreground">All changes are saved.</span>}
        {promptMode === 'custom' ? <span className="text-sm text-warning">You use your own instructions (Advanced), so the tone and rules above are not added to them.</span> : null}
      </div>

      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer p-5 text-lg font-semibold">Advanced: the full instructions</summary>
        <div className="space-y-4 border-t p-5">
          <p className="text-muted-foreground">
            These are the exact instructions Claude receives. They are built from your choices above ({promptMode === 'recommended' ? 'recommended, updated automatically' : 'you edited them by hand, so they no longer update automatically'}).
            Words in double curly brackets, like {'{{company_name}}'}, are filled in for each message.
          </p>
          <Textarea rows={16} className="font-mono text-sm" value={raw} onChange={(e) => setRaw(e.target.value)} aria-label="Full instructions" />
          <div className="flex flex-wrap gap-3">
            <Button disabled={pending || raw === instructions} onClick={() => run(async () => {
              const r = await api<{ previousVersion: number }>('PUT', '/api/prompts/claude_system', { body: raw });
              router.refresh();
              savedWithUndo('Instructions saved.', () => api('POST', '/api/prompts/claude_system/restore', { version: r.previousVersion }), () => router.refresh());
            })}><Save /> Save my instructions</Button>
            <ConfirmButton variant="default" confirmLabel="Yes, reset" buttonProps={{ variant: 'outline' }}
              explanation="Your hand-written instructions are replaced by the recommended ones, built from the tone and rules above. Your version stays in the history, so you can restore it."
              onConfirm={() => run(async () => {
                const r = await api<{ before: ToneSnapshot }>('POST', '/api/tone/reset');
                router.refresh();
                savedWithUndo('Reset to the recommended instructions.', undoTo(r.before), () => router.refresh());
              })}><RotateCcw /> Reset to recommended</ConfirmButton>
          </div>
        </div>
      </details>

      <Card>
        <CardHeader>
          <CardTitle>Earlier versions</CardTitle>
          <CardDescription>Every save is kept. Restore any version with one click (it becomes the newest version, nothing is lost).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <NativeSelect value={historyId} onChange={(e) => setHistoryId(e.target.value as PromptId)} aria-label="Which text" className="max-w-sm">
            {(Object.keys(VERSION_NAMES) as PromptId[]).map((id) => <option key={id} value={id}>{VERSION_NAMES[id]}</option>)}
          </NativeSelect>
          <ol className="divide-y" data-testid="versions">
            {(versions[historyId] ?? []).map((v, i) => (
              <li key={v.version} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Version {v.version}{i === 0 ? ' (in use now)' : ''} · {formatDateTime(v.changed_at)}</p>
                  <p className="text-sm text-muted-foreground">{v.note || 'Saved'}</p>
                  <details className="text-sm"><summary className="cursor-pointer text-primary">Show text</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2">{v.body}</pre></details>
                </div>
                {i > 0 ? (
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => run(async () => {
                    const r = await api<{ previousVersion: number }>('POST', `/api/prompts/${historyId}/restore`, { version: v.version });
                    router.refresh();
                    savedWithUndo(`Version ${v.version} restored.`, () => api('POST', `/api/prompts/${historyId}/restore`, { version: r.previousVersion }), () => router.refresh());
                  })}>Restore</Button>
                ) : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
