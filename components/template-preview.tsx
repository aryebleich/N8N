'use client';
import { tokenizeTemplate, VARIABLE_HELP, type PromptId } from '@/lib/prompt-template';

/** Renders the template with {{variables}} highlighted: valid ones in teal, unknown ones in red. */
export function TemplatePreview({ id, body }: { id: PromptId; body: string }) {
  const tokens = tokenizeTemplate(id, body);
  return (
    <div className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
      {tokens.map((t, i) =>
        t.variable ? (
          <mark
            key={i}
            title={t.variable.valid ? VARIABLE_HELP[t.variable.name] : 'Not available in this prompt'}
            className={t.variable.valid ? 'rounded bg-primary/15 px-0.5 text-primary' : 'rounded bg-destructive/15 px-0.5 text-destructive underline decoration-wavy'}
          >
            {t.text}
          </mark>
        ) : (
          <span key={i}>{t.text}</span>
        ),
      )}
    </div>
  );
}
