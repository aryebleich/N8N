'use client';
import * as React from 'react';
import { formatAge, formatDateTime } from '@/lib/utils';

/** Relative time that updates every 30 s. Renders the absolute time on the server to avoid hydration drift. */
export function TimeAgo({ iso, suffix = ' ago' }: { iso: string | null; suffix?: string }) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return <span>—</span>;
  return <time dateTime={iso} title={formatDateTime(iso)}>{now == null ? formatDateTime(iso) : `${formatAge(iso, now)}${suffix}`}</time>;
}

export function SlaTimer({ dueAt, status }: { dueAt: string | null; status: string }) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!dueAt || status === 'resolved') return <span className="text-muted-foreground">—</span>;
  if (now == null) return <time dateTime={dueAt}>{formatDateTime(dueAt)}</time>;
  const ms = new Date(dueAt).getTime() - now;
  const overdue = ms < 0;
  const mins = Math.round(Math.abs(ms) / 60000);
  const text = mins >= 120 ? `${Math.round(mins / 60)} h` : `${mins} min`;
  return (
    <time dateTime={dueAt} title={formatDateTime(dueAt)} className={overdue ? 'font-semibold text-destructive tabular-nums' : ms < 30 * 60000 ? 'font-medium text-warning tabular-nums' : 'tabular-nums'}>
      {overdue ? `${text} overdue` : `${text} left`}
    </time>
  );
}
