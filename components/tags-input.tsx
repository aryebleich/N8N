'use client';
import * as React from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';

/** Type a word and press Enter (or comma) to add it as a tag. */
export function TagsInput({ id, value, onChange, placeholder, validate, max = 500 }: {
  id?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; validate?: (t: string) => string | null; max?: number;
}) {
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const add = () => {
    const parts = draft.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    for (const p of parts) {
      const problem = validate?.(p);
      if (problem) { setError(problem); return; }
    }
    const next = [...new Set([...value, ...parts])].slice(0, max);
    onChange(next);
    setDraft('');
    setError(null);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
            {t}
            <button type="button" aria-label={`Remove ${t}`} className="rounded-full p-0.5 hover:bg-background" onClick={() => onChange(value.filter((x) => x !== t))}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        {!value.length ? <span className="text-sm text-muted-foreground">Nothing added yet.</span> : null}
      </div>
      <Input
        id={id} value={draft} placeholder={placeholder} aria-invalid={!!error}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">Press Enter after each one.</p>}
    </div>
  );
}
