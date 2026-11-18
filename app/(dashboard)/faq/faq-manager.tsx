'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAction, useApi } from '@/components/csrf';
import { TimeAgo } from '@/components/time-ago';

export interface FaqItem {
  id: number;
  question: string;
  answer: string;
  tags: string;
  active: boolean;
  updatedAt: string;
}

type Editing = { mode: 'create' } | { mode: 'edit'; item: FaqItem } | null;

export function FaqManager({ rows, tags, signature, canEdit }: { rows: FaqItem[]; tags: string[]; signature: string; canEdit: boolean }) {
  const api = useApi();
  const router = useRouter();
  const { pending, run } = useAction();
  const [q, setQ] = React.useState('');
  const [tag, setTag] = React.useState('');
  const [editing, setEditing] = React.useState<Editing>(null);
  const [preview, setPreview] = React.useState<FaqItem | null>(null);
  const [deleting, setDeleting] = React.useState<FaqItem | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);

  const filtered = rows.filter((r) => {
    const t = q.trim().toLowerCase();
    const matchQ = !t || r.question.toLowerCase().includes(t) || r.answer.toLowerCase().includes(t) || r.tags.includes(t);
    const matchTag = !tag || r.tags.split(',').includes(tag);
    return matchQ && matchTag;
  });

  const refresh = () => router.refresh();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="faq-q">Search</label>
        <Input id="faq-q" className="max-w-sm" placeholder="Search questions, answers and tags" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="sr-only" htmlFor="faq-tag">Tag</label>
        <NativeSelect id="faq-tag" className="w-48" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </NativeSelect>
        <span className="text-sm text-muted-foreground tabular-nums">{filtered.length} of {rows.length}</span>
        {canEdit && (
          <span className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}><Upload aria-hidden /> Import</Button>
            <Button onClick={() => setEditing({ mode: 'create' })}><Plus aria-hidden /> New entry</Button>
          </span>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Question</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No entries match. {canEdit && 'Create one or import a CSV/Markdown file.'}</TableCell></TableRow>}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <p className="font-medium">{r.question}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{r.answer}</p>
                </TableCell>
                <TableCell><div className="flex max-w-xs flex-wrap gap-1">{r.tags.split(',').filter(Boolean).map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div></TableCell>
                <TableCell>
                  <Switch
                    checked={r.active}
                    disabled={!canEdit || pending}
                    aria-label={`${r.active ? 'Deactivate' : 'Activate'} “${r.question}”`}
                    onCheckedChange={(v) => run(async () => { await api('PATCH', `/api/faq/${r.id}`, { active: v }); refresh(); }, v ? 'Entry activated' : 'Entry deactivated')}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground"><TimeAgo iso={r.updatedAt} /></TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="icon" variant="ghost" aria-label="Preview" onClick={() => setPreview(r)}><Eye /></Button>
                  {canEdit && (
                    <>
                      <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing({ mode: 'edit', item: r })}><Pencil /></Button>
                      <Button size="icon" variant="ghost" aria-label="Duplicate" disabled={pending} onClick={() => run(async () => { await api('POST', '/api/faq', { duplicateOf: r.id }); refresh(); }, 'Duplicated as an inactive copy')}><Copy /></Button>
                      <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setDeleting(r)}><Trash2 className="text-destructive" /></Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <FaqEditor editing={editing} onClose={() => setEditing(null)} onSaved={refresh} signature={signature} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={refresh} />

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Preview</DialogTitle><DialogDescription>How the models see this entry, and a sample email built from it.</DialogDescription></DialogHeader>
          {preview && <Preview item={preview} signature={signature} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this entry?</DialogTitle><DialogDescription>“{deleting?.question}” will no longer be used in replies. This cannot be undone; deactivate it instead if you might need it again.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={() => deleting && run(async () => { await api('DELETE', `/api/faq/${deleting.id}`); setDeleting(null); refresh(); }, 'Entry deleted')}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Preview({ item, signature }: { item: Pick<FaqItem, 'id' | 'question' | 'answer' | 'tags'>; signature: string }) {
  return (
    <div className="grid gap-4 text-sm">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Knowledge base block (sent to Claude and Gemini)</p>
        <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs">{`[FAQ #${item.id || 'new'}] Q: ${item.question}\nA: ${item.answer}\n(tags: ${item.tags})`}</pre>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sample email reply</p>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Customer asked: “{item.question}”</p>
          <p className="mt-2 whitespace-pre-wrap">{`Hi Alex,\n\n${item.answer}\n\n${signature}`}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Claude rewrites the answer in context; this shows the facts it starts from.</p>
      </div>
    </div>
  );
}

function FaqEditor({ editing, onClose, onSaved, signature }: { editing: Editing; onClose: () => void; onSaved: () => void; signature: string }) {
  const api = useApi();
  const { pending, run } = useAction();
  const [form, setForm] = React.useState({ question: '', answer: '', tags: '', active: true });
  React.useEffect(() => {
    if (editing?.mode === 'edit') setForm({ question: editing.item.question, answer: editing.item.answer, tags: editing.item.tags, active: editing.item.active });
    else if (editing?.mode === 'create') setForm({ question: '', answer: '', tags: '', active: true });
  }, [editing]);
  const save = () =>
    run(async () => {
      if (editing?.mode === 'edit') await api('PATCH', `/api/faq/${editing.item.id}`, form);
      else await api('POST', '/api/faq', form);
      onClose();
      onSaved();
    }, editing?.mode === 'edit' ? 'Entry saved. The next message uses it.' : 'Entry created. The next message can use it.');
  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{editing?.mode === 'edit' ? 'Edit entry' : 'New entry'}</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid content-start gap-3">
            <div className="grid gap-1.5"><Label htmlFor="fq">Question</Label><Input id="fq" value={form.question} maxLength={500} onChange={(e) => setForm({ ...form, question: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="fa">Answer</Label><Textarea id="fa" rows={8} value={form.answer} maxLength={5000} onChange={(e) => setForm({ ...form, answer: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="ft">Tags</Label><Input id="ft" value={form.tags} placeholder="shipping, delivery, late" onChange={(e) => setForm({ ...form, tags: e.target.value })} /><p className="text-xs text-muted-foreground">Comma-separated words customers actually type. Tag matches rank highest.</p></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Active</label>
          </div>
          <Preview item={{ id: editing?.mode === 'edit' ? editing.item.id : 0, question: form.question || 'Your question', answer: form.answer || 'Your answer', tags: form.tags }} signature={signature} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || form.question.trim().length < 3 || form.answer.trim().length < 3} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const api = useApi();
  const { pending, run } = useAction();
  const [format, setFormat] = React.useState<'csv' | 'markdown'>('csv');
  const [content, setContent] = React.useState('');
  const [skip, setSkip] = React.useState(true);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import FAQ entries</DialogTitle>
          <DialogDescription>CSV needs a header row with <code>question,answer,tags,active</code>. Markdown uses one <code>## Question</code> or <code>### Question</code> heading per entry, the answer below it, and an optional <code>Tags: a, b</code> line.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <NativeSelect className="w-40" value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'markdown')} aria-label="Format">
              <option value="csv">CSV</option>
              <option value="markdown">Markdown</option>
            </NativeSelect>
            <Input
              type="file"
              accept=".csv,.md,.markdown,.txt,text/csv,text/markdown"
              className="max-w-xs"
              aria-label="Choose a file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 1_000_000) return;
                setContent(await f.text());
                setFormat(/\.(md|markdown)$/i.test(f.name) ? 'markdown' : 'csv');
              }}
            />
          </div>
          <Textarea rows={12} className="font-mono text-xs" value={content} onChange={(e) => setContent(e.target.value)} placeholder={format === 'csv' ? 'question,answer,tags,active\n"How long does shipping take?","3 to 5 business days.","shipping,delivery",1' : '### How long does shipping take?\nStandard shipping takes 3 to 5 business days.\nTags: shipping, delivery'} aria-label="File contents" />
          <label className="flex items-center gap-2 text-sm"><Switch checked={skip} onCheckedChange={setSkip} /> Skip questions that already exist</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !content.trim()}
            onClick={() =>
              run(async () => {
                const r = await api<{ imported: number; skipped: number; warnings: string[] }>('POST', '/api/faq/import', { format, content, skipDuplicates: skip });
                onClose();
                setContent('');
                onDone();
                return r;
              }).then((r) => {
                if (r) import('sonner').then(({ toast }) => toast.success(`Imported ${r.imported}, skipped ${r.skipped}${r.warnings.length ? `, ${r.warnings.length} rows had problems` : ''}.`));
              })
            }
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
