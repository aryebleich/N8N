'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = React.useState('');
  const [pending, setPending] = React.useState(false);
  return (
    <form
      className="mt-5 grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError('');
        const f = new FormData(e.currentTarget);
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setPending(false);
        if (!res || !res.ok) {
          setError(String(data.error || 'Could not reach the server. Try again.'));
          return;
        }
        router.replace('/');
        router.refresh();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}
