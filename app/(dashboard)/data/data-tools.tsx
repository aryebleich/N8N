'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Download, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAction, useApi } from '@/components/csrf';

const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

export function DataTools({ retentionDays }: { retentionDays: number | null }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <ExportCard />
      <RetentionCard current={retentionDays} />
      <DeleteCard />
    </div>
  );
}

function ExportCard() {
  const [type, setType] = React.useState<'conversations' | 'escalations'>('conversations');
  const [from, setFrom] = React.useState(day(30));
  const [to, setTo] = React.useState(day(0));
  const href = `/api/data/export?${new URLSearchParams({ type, from, to })}`;
  return (
    <Card>
      <CardHeader><CardTitle>Export to CSV</CardTitle><CardDescription>Email addresses are masked and payment data removed. Limited to 10 exports per hour.</CardDescription></CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5"><Label htmlFor="ex-type">Data</Label><NativeSelect id="ex-type" value={type} onChange={(e) => setType(e.target.value as 'conversations' | 'escalations')}><option value="conversations">Conversations (one row per message)</option><option value="escalations">Escalations</option></NativeSelect></div>
          <div className="grid gap-1.5"><Label htmlFor="ex-from">From</Label><Input id="ex-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="ex-to">To</Label><Input id="ex-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div><Button asChild disabled={!from || !to || from > to}><a href={href} download><Download aria-hidden /> Download CSV</a></Button></div>
      </CardContent>
    </Card>
  );
}

function RetentionCard({ current }: { current: number | null }) {
  const api = useApi();
  const router = useRouter();
  const { pending, run } = useAction();
  const [enabled, setEnabled] = React.useState(current !== null);
  const [days, setDays] = React.useState(current ?? 180);
  const [preview, setPreview] = React.useState<{ cutoff: string; messages: number } | null>(null);
  const [confirmText, setConfirmText] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const value = enabled ? days : null;
  return (
    <Card>
      <CardHeader><CardTitle>Retention</CardTitle><CardDescription>Automatically delete messages older than N days. Runs daily; open escalations keep their conversation.</CardDescription></CardHeader>
      <CardContent className="grid gap-3">
        <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={enabled} onCheckedChange={setEnabled} /> Delete old messages automatically</label>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5"><Label htmlFor="ret-days">Keep messages for (days)</Label><Input id="ret-days" type="number" min={7} max={3650} className="w-32" value={days} disabled={!enabled} onChange={(e) => setDays(Number(e.target.value))} /></div>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(async () => {
              if (!value) { setPreview(null); setOpen(true); return; }
              const r = await api<{ preview: { cutoff: string; messages: number } }>('POST', '/api/data/retention', { mode: 'preview', days: value });
              setPreview(r.preview);
              setOpen(true);
            })}
          >
            Review and save
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Current setting: {current ? `${current} days` : 'keep everything'}.</p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmText(''); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{value ? `Keep ${value} days of messages?` : 'Turn retention off?'}</DialogTitle>
              <DialogDescription>
                {value && preview ? <>This deletes <strong>{preview.messages}</strong> messages older than {preview.cutoff.slice(0, 10)} now, and keeps deleting daily. Deleted messages cannot be recovered.</> : 'Messages will be kept until you delete them.'}
              </DialogDescription>
            </DialogHeader>
            {value && <div className="grid gap-1.5"><Label htmlFor="ret-confirm">Type DELETE to confirm</Label><Input id="ret-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" /></div>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                variant={value ? 'destructive' : 'default'}
                disabled={pending || (!!value && confirmText !== 'DELETE')}
                onClick={() => run(async () => {
                  await api('POST', '/api/data/retention', value ? { mode: 'apply', days: value, confirm: 'DELETE' } : { mode: 'apply', days: null, confirm: 'DELETE' });
                  setOpen(false);
                  setConfirmText('');
                  router.refresh();
                }, value ? 'Retention saved and applied' : 'Retention turned off')}
              >
                {value ? 'Delete and save' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function DeleteCard() {
  const api = useApi();
  const { pending, run } = useAction();
  const [email, setEmail] = React.useState('');
  const [confirmEmail, setConfirmEmail] = React.useState('');
  const [result, setResult] = React.useState<{ conversations: number; messages: number; sessionTokens: number } | null>(null);
  return (
    <Card className="xl:col-span-2">
      <CardHeader><CardTitle>Delete a customer&apos;s data</CardTitle><CardDescription>For erasure requests. Removes their conversations, messages, AI decisions, notes, escalations and chat session tokens from Turso. Oracle is not touched, and the audit log keeps only a masked record that the deletion happened.</CardDescription></CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="del-email">Customer email</Label><Input id="del-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></div>
          <div className="grid gap-1.5"><Label htmlFor="del-confirm">Type the email again</Label><Input id="del-confirm" type="email" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" /></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="destructive"
            disabled={pending || !email || email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()}
            onClick={() => run(async () => {
              const r = await api<{ deleted: { conversations: number; messages: number; sessionTokens: number } }>('POST', '/api/data/delete-customer', { email, confirmEmail });
              setResult(r.deleted);
              setEmail('');
              setConfirmEmail('');
            }, 'Customer data deleted')}
          >
            <Trash2 aria-hidden /> Delete permanently
          </Button>
          {result && <p role="status" className="text-sm">Deleted {result.conversations} conversations, {result.messages} messages and {result.sessionTokens} session tokens.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
