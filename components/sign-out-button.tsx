'use client';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApi } from '@/components/csrf';

export function SignOutButton() {
  const api = useApi();
  const router = useRouter();
  return (
    <Button variant="outline" size="sm" onClick={async () => { await api('POST', '/api/auth/logout').catch(() => undefined); router.replace('/login'); router.refresh(); }}>
      <LogOut aria-hidden /> Sign out
    </Button>
  );
}
