'use client';
import { diffLines } from 'diff';

export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = diffLines(before, after);
  const changed = parts.some((p) => p.added || p.removed);
  if (!changed) return <p className="text-sm text-muted-foreground">No differences.</p>;
  return (
    <pre className="max-h-[28rem] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed" aria-label="Changes">
      {parts.map((p, i) => (
        <span
          key={i}
          className={p.added ? 'block bg-success/15 text-success' : p.removed ? 'block bg-destructive/10 text-destructive line-through decoration-destructive/40' : 'block text-muted-foreground'}
        >
          {p.value.replace(/\n$/, '').split('\n').map((l) => `${p.added ? '+ ' : p.removed ? '- ' : '  '}${l}`).join('\n')}
        </span>
      ))}
    </pre>
  );
}
