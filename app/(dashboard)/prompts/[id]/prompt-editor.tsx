'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, History, RotateCcw, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DiffView } from '@/components/diff-view';
import { TemplatePreview } from '@/components/template-preview';
import { useAction, useApi } from '@/components/csrf';
import { validateTemplate, type PromptId } from '@/lib/prompt-template';
import { formatDateTime } from '@/lib/utils';

interface Version { version: number; body: string; changedAt: string; changedBy: string; note: string | null }

interface Props {
  id: PromptId;
  canEdit: boolean;
  initialBody: string;
  version: number;
  allowed: { name: string; help: string }[];
  required: string[];
  versions: Version[];
  testable: boolean;
}

export function PromptEditor({ id, canEdit, initialBody, version, allowed, required, versions, testable }: Props) {
  const api = useApi();
  const router = useRouter();
  const { pending, run } = useAction();
  const [body, setBody] = React.useState(initialBody);
  const [note, setNote] = React.useState('');
  const [compare, setCompare] = React.useState<number | null>(versions[1]?.version ?? null);
  const [restoreTarget, setRestoreTarget] = React.useState<Version | null>(null);
  React.useEffect(() => setBody(initialBody), [initialBody]);
  const check = React.useMemo(() => validateTemplate(id, body), [id, body]);
  const dirty = body !== initialBody;
  const compareBody = versions.find((v) => v.version === compare)?.body ?? '';
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const insert = (name: string) => {
    const el = ref.current;
    const token = `{{${name}}}`;
    if (!el) { setBody((b) => b + token); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid min-w-0 content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">Editor <Badge variant="secondary">v{version}</Badge>{dirty && <Badge variant="warning">unsaved changes</Badge>}</CardTitle>
            <CardDescription>Variables: click to insert. {required.length > 0 && <>Required: {required.map((r) => <code key={r}>{`{{${r}}}`}</code>)}.</>}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-1.5">
              {allowed.map((v) => (
                <Button key={v.name} type="button" size="sm" variant="outline" disabled={!canEdit} title={v.help} onClick={() => insert(v.name)} className="font-mono text-xs">{`{{${v.name}}}`}</Button>
              ))}
            </div>
            <Label htmlFor="prompt-body" className="sr-only">Prompt text</Label>
            <Textarea id="prompt-body" ref={ref} rows={18} className="font-mono text-xs leading-relaxed" value={body} readOnly={!canEdit} onChange={(e) => setBody(e.target.value)} aria-invalid={!check.ok} />
            <div aria-live="polite" className="grid gap-1 text-sm">
              {check.errors.map((e) => <p key={e} className="text-destructive">✕ {e}</p>)}
              {check.warnings.map((w) => <p key={w} className="text-warning">! {w}</p>)}
              {check.ok && check.warnings.length === 0 && <p className="text-success">✓ Template is valid. Variables used: {check.variables.length ? check.variables.join(', ') : 'none'}.</p>}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Highlighted</p>
              <TemplatePreview id={id} body={body} />
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-end gap-2 border-t pt-4">
                <div className="grid min-w-64 flex-1 gap-1.5">
                  <Label htmlFor="note">Change note (optional)</Label>
                  <Input id="note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Clarify refund policy wording" />
                </div>
                <Button variant="ghost" disabled={!dirty || pending} onClick={() => setBody(initialBody)}>Discard</Button>
                <Button
                  disabled={!dirty || !check.ok || pending}
                  onClick={() => run(async () => { await api('PUT', `/api/prompts/${id}`, { body, note, expectedVersion: version }); setNote(''); router.refresh(); }, 'Saved as a new version. n8n picks it up within 30 seconds.')}
                >
                  <Save aria-hidden /> Save version {version + 1}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        {testable && canEdit && <TestPanel id={id} draftBody={body} />}
      </div>

      <Card className="min-w-0 content-start">
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" aria-hidden /> Version history</CardTitle><CardDescription>Compare any version with the editor text, or restore it as a new version.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <ol className="grid max-h-72 gap-1 overflow-auto">
            {versions.map((v) => (
              <li key={v.version} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                <button type="button" className="min-w-0 text-left" onClick={() => setCompare(v.version)} aria-pressed={compare === v.version}>
                  <span className="font-medium">v{v.version}</span>{v.version === version && <Badge className="ml-1.5" variant="success">current</Badge>}
                  <span className="block truncate text-xs text-muted-foreground">{formatDateTime(v.changedAt)} · {v.changedBy}{v.note ? ` · ${v.note}` : ''}</span>
                </button>
                {canEdit && v.version !== version && <Button size="sm" variant="outline" onClick={() => setRestoreTarget(v)}><RotateCcw aria-hidden /> Restore</Button>}
              </li>
            ))}
          </ol>
          <div className="grid gap-1.5">
            <Label htmlFor="compare">Diff: version → editor</Label>
            <NativeSelect id="compare" value={compare ?? ''} onChange={(e) => setCompare(e.target.value ? Number(e.target.value) : null)}>
              {versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}
            </NativeSelect>
          </div>
          {compare != null && <DiffView before={compareBody} after={body} />}
        </CardContent>
      </Card>

      <Dialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Restore version {restoreTarget?.version}?</DialogTitle><DialogDescription>This saves it as version {version + 1}. Nothing is deleted; you can restore the current text later.</DialogDescription></DialogHeader>
          {restoreTarget && <DiffView before={initialBody} after={restoreTarget.body} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>Cancel</Button>
            <Button disabled={pending} onClick={() => restoreTarget && run(async () => { await api('POST', `/api/prompts/${id}/restore`, { version: restoreTarget.version }); setRestoreTarget(null); router.refresh(); }, `Restored v${restoreTarget.version}`)}>Restore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TestResult {
  retrieval: { method: string; keywords: string[]; faqIds: number[] };
  claude: { ok: boolean; parsed: unknown; raw: string; error: string | null; latencyMs: number; model: string };
  gemini: { ok: boolean; parsed: unknown; raw: string; error: string | null; latencyMs: number; model: string };
  decision: { threshold: number; autoSend: boolean; reasons: string[] };
}

function TestPanel({ id, draftBody }: { id: PromptId; draftBody: string }) {
  const api = useApi();
  const { pending, run } = useAction();
  const [message, setMessage] = React.useState('How long does shipping take?');
  const [channel, setChannel] = React.useState<'email' | 'chat'>('chat');
  const [useDraft, setUseDraft] = React.useState(true);
  const [result, setResult] = React.useState<TestResult | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FlaskConical className="size-4" aria-hidden /> Test prompt</CardTitle>
        <CardDescription>Runs a sample message through Claude, then Gemini, with live FAQ retrieval. Nothing is sent to a customer and nothing is saved.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5"><Label htmlFor="test-msg">Sample customer message</Label><Textarea id="test-msg" rows={3} value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} /></div>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect className="w-32" value={channel} onChange={(e) => setChannel(e.target.value as 'email' | 'chat')} aria-label="Channel"><option value="chat">Chat</option><option value="email">Email</option></NativeSelect>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useDraft} onChange={(e) => setUseDraft(e.target.checked)} className="size-4 accent-[var(--primary)]" /> Use the unsaved editor text</label>
          <Button
            className="ml-auto"
            disabled={pending || !message.trim()}
            onClick={() => run(async () => {
              const r = await api<TestResult>('POST', '/api/prompts/test', { message, channel, overrides: useDraft ? { [id]: draftBody } : {} });
              setResult(r);
            })}
          >
            {pending ? 'Running…' : 'Run test'}
          </Button>
        </div>
        {result && (
          <Tabs defaultValue="summary">
            <TabsList><TabsTrigger value="summary">Summary</TabsTrigger><TabsTrigger value="claude">Claude JSON</TabsTrigger><TabsTrigger value="gemini">Gemini JSON</TabsTrigger></TabsList>
            <TabsContent value="summary" className="grid gap-2 text-sm">
              <p><Badge variant={result.decision.autoSend ? 'success' : 'destructive'}>{result.decision.autoSend ? 'Would auto-send' : 'Would escalate'}</Badge> at threshold {result.decision.threshold.toFixed(2)}</p>
              {result.decision.reasons.length > 0 && <ul className="list-disc pl-5 text-muted-foreground">{result.decision.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
              <p className="text-muted-foreground">FAQ retrieval: {result.retrieval.method} · keywords {result.retrieval.keywords.join(', ') || 'none'} · entries {result.retrieval.faqIds.map((i) => `#${i}`).join(', ') || 'none'}</p>
              <p className="text-muted-foreground">Claude {result.claude.model}: {result.claude.ok ? `${result.claude.latencyMs} ms` : result.claude.error} · Gemini {result.gemini.model}: {result.gemini.ok ? `${result.gemini.latencyMs} ms` : result.gemini.error}</p>
            </TabsContent>
            <TabsContent value="claude"><pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs">{result.claude.parsed ? JSON.stringify(result.claude.parsed, null, 2) : result.claude.raw || result.claude.error}</pre></TabsContent>
            <TabsContent value="gemini"><pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs">{result.gemini.parsed ? JSON.stringify(result.gemini.parsed, null, 2) : result.gemini.raw || result.gemini.error}</pre></TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
