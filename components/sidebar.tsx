'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, FlaskConical, House, Menu, MessagesSquare, Palette, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const NAV = [
  { href: '/', label: 'Home', icon: House },
  { href: '/conversations', label: 'Conversations', icon: MessagesSquare },
  { href: '/answers', label: 'Answers (FAQ)', icon: BookOpen },
  { href: '/tone', label: 'Tone and Rules', icon: Palette },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/test', label: 'Test Center', icon: FlaskConical },
] as const;

function NavLinks({ waiting, onNavigate }: { waiting: number; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
            className={cn('flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors', active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
            <Icon className="size-5 shrink-0" aria-hidden />
            <span className="flex-1">{label}</span>
            {href === '/conversations' && waiting > 0 ? (
              <span className={cn('rounded-full px-2 text-sm font-semibold', active ? 'bg-primary-foreground text-primary' : 'bg-warning text-black')} title={`${waiting} waiting for a person`}>{waiting}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ company, enabled }: { company: string; enabled: boolean }) {
  return (
    <div className="px-3">
      <p className="text-lg font-bold leading-tight">{company}</p>
      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn('inline-block size-2.5 rounded-full', enabled ? 'bg-success' : 'bg-destructive')} aria-hidden />
        Assistant is {enabled ? 'ON' : 'OFF'}
      </p>
    </div>
  );
}

export function Shell({ company, enabled, waiting, children }: { company: string; enabled: boolean; waiting: number; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = React.useState(false);
  if (path.startsWith('/wizard')) return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">{children}</main>;
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r bg-card py-6 pl-3 pr-3 lg:flex">
        <Brand company={company} enabled={enabled} />
        <NavLinks waiting={waiting} />
        <p className="mt-auto px-3 text-xs text-muted-foreground">No login: this panel only opens on this computer unless ADMIN_PUBLIC is turned on.</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card px-4 py-3 lg:hidden">
          <Brand company={company} enabled={enabled} />
          <button type="button" className="rounded-lg p-2 hover:bg-muted" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu className="size-6" />
          </button>
        </header>
        {open ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 bg-card p-4 shadow-xl">
              <div className="flex items-start justify-between">
                <Brand company={company} enabled={enabled} />
                <button type="button" aria-label="Close menu" className="rounded-lg p-2 hover:bg-muted" onClick={() => setOpen(false)}><X className="size-6" /></button>
              </div>
              <NavLinks waiting={waiting} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
