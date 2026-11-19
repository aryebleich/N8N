'use client';
import * as React from 'react';
import { Popover } from 'radix-ui';
import { HelpCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';

/** "What does this do?" button with a short explanation and an example. */
export function WhatDoesThisDo({ what, example }: { what: string; example?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm text-primary hover:bg-accent">
          <HelpCircle className="size-4" aria-hidden /> What does this do?
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} collisionPadding={16} className="z-50 max-w-sm rounded-lg border bg-card p-4 text-sm shadow-lg">
          <p>{what}</p>
          {example ? <p className="mt-2 rounded-md bg-muted p-2"><span className="font-medium">Example: </span>{example}</p> : null}
          <Popover.Arrow className="fill-card" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A setting: bold label, one-sentence help text, the tooltip, then the control. */
export function Field({ label, htmlFor, help, what, example, children }: { label: string; htmlFor?: string; help: string; what: string; example?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2">
        <Label htmlFor={htmlFor} className="text-base font-semibold">{label}</Label>
        <WhatDoesThisDo what={what} example={example} />
      </div>
      <p className="text-sm text-muted-foreground">{help}</p>
      {children}
    </div>
  );
}
