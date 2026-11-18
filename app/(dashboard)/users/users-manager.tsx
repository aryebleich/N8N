'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, UserPlus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CopyButton } from '@/components/copy-button';
import { useAction, useApi } from '@/components/csrf';
import { TimeAgo } from '@/components/time-ago';

interface U { id: string; email: string; name: string | null; role: 'owner' | 'agent'; active: boolean; pending: boolean; createdAt: string; lastLoginAt: string | null }

export function UsersManager({ users, meId }: { users: U[]; meId: string }) {
  const api = useApi();
  const router = useRouter();
  const { pending, run } = useAction();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ email: '', name: '', role: 'agent' as 'owner' | 'agent' });
  const [link, setLink] = React.useState<{ link: string; emailed: boolean; title: string } | null>(null);
  const [confirm, setConfirm] = React.useState<{ user: U; action: 'deactivate' | 'reset_password' } | null>(null);

  const patch = (id: string, body: Record<string, unknown>, msg: string) => run(async () => { const r = await api<{ link?: string; emailed?: boolean }>('PATCH', `/api/users/${id}`, body); router.refresh(); return r; }, msg);

  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setOpen(true)}><UserPlus aria-hidden /> Invite teammate</Button></div>
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Last sign-in</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell><p className="font-medium">{u.name || '—'}{u.id === meId && <span className="text-muted-foreground"> (you)</span>}</p><p className="text-xs text-muted-foreground">{u.email}</p></TableCell>
                <TableCell>
                  <NativeSelect className="h-8 w-28" value={u.role} disabled={pending || u.id === meId} aria-label={`Role for ${u.email}`} onChange={(e) => patch(u.id, { action: 'role', role: e.target.value }, 'Role updated')}>
                    <option value="agent">Agent</option><option value="owner">Owner</option>
                  </NativeSelect>
                </TableCell>
                <TableCell>{!u.active ? <Badge variant="secondary">Deactivated</Badge> : u.pending ? <Badge variant="warning">Invite pending</Badge> : <Badge variant="success">Active</Badge>}</TableCell>
                <TableCell className="text-muted-foreground"><TimeAgo iso={u.lastLoginAt} /></TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" disabled={pending || !u.active} onClick={() => setConfirm({ user: u, action: 'reset_password' })}><KeyRound aria-hidden /> {u.pending ? 'New invite link' : 'Reset password'}</Button>
                  {u.id !== meId && (u.active
                    ? <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setConfirm({ user: u, action: 'deactivate' })}>Deactivate</Button>
                    : <Button size="sm" variant="ghost" disabled={pending} onClick={() => patch(u.id, { action: 'activate' }, 'User reactivated')}>Reactivate</Button>)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite a teammate</DialogTitle><DialogDescription>They get an email with a one-time link (72 hours) to set their password. You also get the link to share yourself.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label htmlFor="inv-email">Email</Label><Input id="inv-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="inv-name">Name (optional)</Label><Input id="inv-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="inv-role">Role</Label><NativeSelect id="inv-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'owner' | 'agent' })}><option value="agent">Agent</option><option value="owner">Owner</option></NativeSelect></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || !form.email} onClick={async () => {
              const r = await run(async () => { const out = await api<{ link: string; emailed: boolean }>('POST', '/api/users', form); router.refresh(); return out; });
              if (r) { setOpen(false); setForm({ email: '', name: '', role: 'agent' }); setLink({ ...r, title: 'Invite created' }); }
            }}>Send invite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.action === 'deactivate' ? `Deactivate ${confirm.user.email}?` : `Reset the password for ${confirm?.user.email}?`}</DialogTitle>
            <DialogDescription>{confirm?.action === 'deactivate' ? 'They are signed out immediately and their open escalations become unassigned. You can reactivate them later.' : 'They are signed out and get a one-time link to choose a new password.'}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant={confirm?.action === 'deactivate' ? 'destructive' : 'default'} disabled={pending} onClick={async () => {
              if (!confirm) return;
              const r = await patch(confirm.user.id, { action: confirm.action }, confirm.action === 'deactivate' ? 'User deactivated' : 'Reset link created');
              setConfirm(null);
              if (r?.link) setLink({ link: r.link, emailed: !!r.emailed, title: 'Password reset link' });
            }}>{confirm?.action === 'deactivate' ? 'Deactivate' : 'Create reset link'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{link?.title}</DialogTitle><DialogDescription>{link?.emailed ? 'We emailed this link. ' : 'Email is not configured or failed, so share this link yourself. '}It works once and is shown only now.</DialogDescription></DialogHeader>
          {link && <div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded bg-muted p-2 text-xs">{link.link}</code><CopyButton value={link.link} /></div>}
          <DialogFooter><Button onClick={() => setLink(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
