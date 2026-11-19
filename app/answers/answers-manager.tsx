'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, History, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { api, savedWithUndo, useAction } from '@/components/api';
import { ConfirmButton } from '@/components/confirm';
import { Field } from '@/components/help';
import { TagsInput } from '@/components/tags-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/utils';
import type { Answer, AnswerHistoryEntry } from '@/lib/faq-admin';
import type { ImportRow } from '@/lib/faq-import';

interface Draft { id: number | null; question: string; answer: string; tags: string[]; active: boolean }
const blank: Draft = { id: null, question: '', answer: '', tags: [], active: true };
const split = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean);

export function AnswersManager({ initial, openNew, signature }: { initial: Answer[]; openNew: boolean; signature: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [q, setQ] = React.useState('');
  const [draft, setDraft] = React.useState<Draft | null>(openNew ? blank : null);
  const [historyFor, setHistoryFor] = React.useState<Answer | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const refresh = () => router.refresh();

  const shown = initial.filter((a) => !q || `${a.question} ${a.answer} ${a.tags}`.toLowerCase().includes(q.toLowerCase()));

  const save = () => run(async () => {
    if (!draft) return;
    const body = { question: draft.question, answer: draft.answer, tags: draft.tags, active: draft.active };
    if (draft.id == null) {
      const r = await api<{ id: number }>('POST', '/api/answers', body);
      setDraft(null);
      refresh();
      savedWithUndo('Answer added.', () => api('DELETE', `/api/answers/${r.id}`), refresh);
    } else {
      const id = draft.id;
      const r = await api<{ auditId: number }>('PATCH', `/api/answers/${id}`, body);
      setDraft(null);
      refresh();
      savedWithUndo('Answer saved.', () => api('POST', `/api/answers/${id}/restore`, { auditId: r.auditId, which: 'before' }), refresh);
    }
  });

  const toggle = (a: Answer, on: boolean) => run(async () => {
    const r = await api<{ auditId: number }>('PATCH', `/api/answers/${a.id}`, { active: on });
    refresh();
    savedWithUndo(on ? 'The assistant will use this answer.' : 'The assistant will not use this answer.', () => api('POST', `/api/answers/${a.id}/restore`, { auditId: r.auditId, which: 'before' }), refresh);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your answers" className="pl-10" aria-label="Search your answers" />
        </div>
        <Button size="lg" onClick={() => setDraft(blank)}><Plus /> Add an answer</Button>
        <Button size="lg" variant="outline" onClick={() => setImportOpen(true)}><Upload /> Import a spreadsheet</Button>
      </div>
      <p className="text-sm text-muted-foreground">{initial.filter((a) => a.active).length} of {initial.length} answers are in use.</p>

      <div className="space-y-3" data-testid="answer-list">
        {shown.map((a) => (
          <Card key={a.id} className={a.active ? '' : 'opacity-70'}>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Question</p>
                  <p className="text-lg font-semibold">{a.question}</p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch checked={!!a.active} onCheckedChange={(v) => toggle(a, v)} disabled={pending} aria-label={`Use this answer: ${a.question}`} />
                  Use this answer
                </label>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Reply</p>
                <p className="whitespace-pre-wrap">{a.answer}</p>
              </div>
              {a.tags ? <p className="flex flex-wrap gap-1">{split(a.tags).map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-sm">{t}</span>)}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setDraft({ id: a.id, question: a.question, answer: a.answer, tags: split(a.tags), active: !!a.active })}><Pencil /> Edit</Button>
                <Button variant="outline" size="sm" onClick={() => setHistoryFor(a)}><History /> History</Button>
                <ConfirmButton
                  buttonProps={{ size: 'sm' }} confirmLabel="Yes, delete it"
                  explanation={<>The assistant will stop using “{a.question}”. You can bring it back for 10 seconds with Undo, and later from the history.</>}
                  onConfirm={() => run(async () => { await api('DELETE', `/api/answers/${a.id}`); refresh(); savedWithUndo('Answer deleted.', () => restoreDeleted(a.id), refresh); })}
                ><Trash2 /> Delete</ConfirmButton>
              </div>
            </CardContent>
          </Card>
        ))}
        {!shown.length ? <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">{q ? 'No answers match your search.' : 'No answers yet. Add your first one, or import a spreadsheet.'}</p> : null}
      </div>

      <AnswerForm draft={draft} setDraft={setDraft} onSave={save} pending={pending} signature={signature} />
      <HistoryDialog answer={historyFor} onClose={() => setHistoryFor(null)} onRestored={refresh} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={refresh} />
    </div>
  );
}

/** Undo after delete: restore from the newest history entry ("faq.delete" keeps the old text). */
async function restoreDeleted(id: number) {
  const { history } = await api<{ history: AnswerHistoryEntry[] }>('GET', `/api/answers/${id}/history`);
  const del = history.find((h) => h.action === 'faq.delete');
  if (!del) throw new Error('This answer cannot be brought back.');
  await api('POST', `/api/answers/${id}/restore`, { auditId: del.auditId, which: 'before' });
}

function AnswerForm({ draft, setDraft, onSave, pending, signature }: { draft: Draft | null; setDraft: (d: Draft | null) => void; onSave: () => void; pending: boolean; signature: string }) {
  const d = draft ?? blank;
  const set = (p: Partial<Draft>) => setDraft({ ...d, ...p });
  const valid = d.question.trim().length >= 3 && d.answer.trim().length >= 3;
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{d.id == null ? 'Add an answer' : 'Edit answer'}</DialogTitle>
          <DialogDescription>Write it the way you would answer a customer yourself.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-5">
            <Field label="Question" htmlFor="f-q" help="What a customer might ask." what="The assistant compares each customer message with your questions to find the right answer. Write it like a customer would." example="How long does shipping take?">
              <Input id="f-q" value={d.question} onChange={(e) => set({ question: e.target.value })} maxLength={500} />
            </Field>
            <Field label="Reply" htmlFor="f-a" help="The facts the assistant may use in its answer." what="The assistant writes its reply from this text. It never promises anything that is not written here, so include the details that matter (times, prices, conditions)." example="Standard shipping takes 3 to 5 business days. Express takes 1 to 2.">
              <Textarea id="f-a" rows={6} value={d.answer} onChange={(e) => set({ answer: e.target.value })} maxLength={5000} />
            </Field>
            <Field label="Keywords" htmlFor="f-k" help="Extra words that help find this answer (optional)." what="Words customers might use that are not in the question. They help the assistant pick this answer." example="delivery, shipping time, how long">
              <TagsInput id="f-k" value={d.tags} onChange={(tags) => set({ tags })} placeholder="Type a word and press Enter" max={30} />
            </Field>
            <label className="flex items-center gap-3 font-medium">
              <Switch checked={d.active} onCheckedChange={(active) => set({ active })} /> Use this answer
            </label>
          </div>
          <div className="space-y-3" aria-live="polite">
            <p className="font-semibold">Live preview</p>
            <p className="text-sm text-muted-foreground">Roughly how a customer sees it. The assistant adapts the wording to each question and your tone.</p>
            <div className="rounded-xl border bg-muted p-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">💬 Chat</p>
              <div className="ml-auto w-fit max-w-full rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground">{d.question || 'Customer question…'}</div>
              <div className="mt-2 w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-card px-3 py-2">{d.answer || 'Your reply…'}</div>
            </div>
            <div className="rounded-xl border bg-card p-4 text-sm">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">✉️ Email</p>
              <p className="whitespace-pre-wrap">{`Hi Ada,\n\n${d.answer || 'Your reply…'}\n\n${signature}`}</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
          <Button size="lg" onClick={onSave} disabled={pending || !valid}>{pending ? 'Saving…' : 'Save answer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACTION_LABEL: Record<string, string> = { 'faq.create': 'Added', 'faq.update': 'Changed', 'faq.delete': 'Deleted', 'faq.restore': 'Restored' };

function HistoryDialog({ answer, onClose, onRestored }: { answer: Answer | null; onClose: () => void; onRestored: () => void }) {
  const { pending, run } = useAction();
  const [items, setItems] = React.useState<AnswerHistoryEntry[] | null>(null);
  React.useEffect(() => {
    setItems(null);
    if (answer) api<{ history: AnswerHistoryEntry[] }>('GET', `/api/answers/${answer.id}/history`).then((r) => setItems(r.history)).catch(() => setItems([]));
  }, [answer]);
  return (
    <Dialog open={!!answer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>Every version of “{answer?.question}”, newest first. Restore puts that version back (and keeps this history).</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {(items ?? []).map((h) => {
            const version = h.after ?? h.before;
            return (
              <li key={h.auditId} className="rounded-lg border p-3">
                <p className="text-sm font-semibold">{ACTION_LABEL[h.action] ?? h.action} · {formatDateTime(h.at)}</p>
                {version ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm">{version.answer}</p> : null}
                {h.after && h.action !== 'faq.delete' ? (
                  <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={() => run(async () => { await api('POST', `/api/answers/${answer!.id}/restore`, { auditId: h.auditId, which: 'after' }); onRestored(); onClose(); }, 'This version is back.')}>Restore this version</Button>
                ) : h.before ? (
                  <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={() => run(async () => { await api('POST', `/api/answers/${answer!.id}/restore`, { auditId: h.auditId, which: 'before' }); onRestored(); onClose(); }, 'The answer is back.')}>Bring back</Button>
                ) : null}
              </li>
            );
          })}
          {items && !items.length ? <li className="text-muted-foreground">No history yet.</li> : null}
          {!items ? <li className="text-muted-foreground">Loading…</li> : null}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { pending, run } = useAction();
  const [content, setContent] = React.useState('');
  const [preview, setPreview] = React.useState<{ rows: ImportRow[]; good: number; bad: number } | null>(null);
  const reset = () => { setContent(''); setPreview(null); };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) { setPreview(null); return void run(async () => { throw new Error('That file is larger than 1 MB. Split it into smaller files.'); }); }
    const text = await file.text();
    setContent(text);
    await run(async () => setPreview(await api('POST', '/api/answers/import', { mode: 'preview', content: text })));
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import answers from a spreadsheet</DialogTitle>
          <DialogDescription>Save your spreadsheet as CSV with the columns question, reply, keywords and use_this_answer. Questions you already have are skipped.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline"><a href="/api/answers/template" download><Download /> Download the template</a></Button>
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90">
              <Upload className="size-5" /> Choose a CSV file
              <input type="file" accept=".csv,text/csv" className="sr-only" data-testid="csv-input" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
          {preview ? (
            <div className="space-y-2">
              <p className="font-medium">Preview: {preview.good} ready to import{preview.bad ? `, ${preview.bad} with a problem (these are skipped)` : ''}.</p>
              <div className="max-h-80 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left"><tr><th className="p-2">Row</th><th className="p-2">Question</th><th className="p-2">Reply</th><th className="p-2">Status</th></tr></thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.line} className="border-t align-top">
                        <td className="p-2">{r.line}</td>
                        <td className="p-2">{r.question}</td>
                        <td className="p-2"><span className="line-clamp-2">{r.answer}</span></td>
                        <td className={`p-2 ${r.problem ? 'text-destructive' : 'text-success'}`}>{r.problem ?? (r.active ? 'OK' : 'OK (not in use)')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button size="lg" disabled={pending || !preview?.good} onClick={() => run(async () => {
            const r = await api<{ added: number; skipped: number }>('POST', '/api/answers/import', { mode: 'import', content });
            reset(); onOpenChange(false); onDone();
            return r;
          }).then((r) => r && toast.success(`${r.added} answers imported${r.skipped ? `, ${r.skipped} skipped because you already have them` : ''}.`))}>
            Import {preview?.good ?? 0} answers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
