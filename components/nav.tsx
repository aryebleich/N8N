'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BookOpen, ClipboardList, Database, Gauge, Inbox, KeyRound, Settings, ShieldAlert, Sparkles, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: 'Dashboard', icon: Gauge, owner: false },
  { href: '/conversations', label: 'Conversations', icon: Inbox, owner: false },
  { href: '/escalations', label: 'Escalations', icon: ShieldAlert, owner: false },
  { href: '/faq', label: 'Knowledge base', icon: BookOpen, owner: false },
  { href: '/prompts', label: 'Prompts', icon: Sparkles, owner: false },
  { href: '/settings', label: 'Settings', icon: Settings, owner: true },
  { href: '/integrations', label: 'Integrations', icon: Activity, owner: true },
  { href: '/users', label: 'Users', icon: Users, owner: true },
  { href: '/audit', label: 'Audit log', icon: ClipboardList, owner: true },
  { href: '/data', label: 'Data tools', icon: Database, owner: true },
];

export function Nav({ role, openEscalations }: { role: 'owner' | 'agent'; openEscalations: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {ITEMS.filter((i) => role === 'owner' || !i.owner).map((i) => {
        const active = i.href === '/' ? pathname === '/' : pathname.startsWith(i.href);
        const Icon = i.icon;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={cn('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm', active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <Icon className="size-4" aria-hidden />
            <span className="flex-1">{i.label}</span>
            {i.href === '/escalations' && openEscalations > 0 && (
              <span className="rounded-full bg-destructive/15 px-1.5 text-xs font-semibold text-destructive tabular-nums">{openEscalations}</span>
            )}
          </Link>
        );
      })}
      {role === 'agent' && (
        <p className="mt-3 flex items-center gap-1.5 px-2.5 text-xs text-muted-foreground">
          <KeyRound className="size-3.5" aria-hidden /> Settings are owner-only
        </p>
      )}
    </nav>
  );
}
