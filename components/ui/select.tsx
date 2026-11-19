import * as React from 'react';
import { cn } from '@/lib/utils';

/** Native select styled to match shadcn inputs (accessible, no portal, works without JS). */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn('h-11 w-full rounded-md border border-input bg-card px-2.5 text-base shadow-xs disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    />
  );
}
