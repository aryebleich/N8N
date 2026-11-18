'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = React.useState('');
  const [pending, setPending] = React.useState(false);
  return (
    <form
      className="mt-5 grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get('password') !== f.get('confirm')) { setError('The two passwords do not match.'); return; }
        setPending(true);
        setError('');
        const res = await fetch('/api/auth/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, name: f.get('name'), password: f.get('password') }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setPending(false);
        if (!res || !res.ok) {
          const details = Array.isArray(data.details) ? data.details.map((d: { message?: string }) => d.message).join(' ') : '';
          setError(`${String(data.error || 'Could not reach the server.')} ${details}`.trim());
          return;
        }
        router.replace('/');
        router.refresh();
      }}
    >
      <div className="grid gap-1.5"><Label htmlFor="name">Your name</Label><Input id="name" name="name" autoComplete="name" required /></div>
      <div className="grid gap-1.5"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required /></div>
      <div className="grid gap-1.5"><Label htmlFor="confirm">Repeat password</Label><Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Set password and sign in'}</Button>
    </form>
  );
}
