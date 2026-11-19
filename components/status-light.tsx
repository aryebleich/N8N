import { cn } from '@/lib/utils';

const COLORS = { green: 'bg-success', yellow: 'bg-warning', red: 'bg-destructive' } as const;

export function StatusDot({ light, className }: { light: keyof typeof COLORS; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-3 shrink-0 rounded-full', COLORS[light], className)} />;
}

export function StatusLight({ light, label }: { light: keyof typeof COLORS; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-medium">
      <StatusDot light={light} /> {label}
    </span>
  );
}
