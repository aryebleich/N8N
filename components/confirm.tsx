'use client';
import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button, type ButtonProps } from '@/components/ui/button';

/** Every destructive or risky action asks first, in plain words. */
export function ConfirmButton({
  children, title = 'Are you sure?', explanation, confirmLabel = 'Yes, do it', onConfirm, variant = 'destructive', buttonProps,
}: {
  children: React.ReactNode; title?: string; explanation: React.ReactNode; confirmLabel?: string;
  onConfirm: () => Promise<unknown> | unknown; variant?: ButtonProps['variant']; buttonProps?: ButtonProps;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <Button variant={variant === 'destructive' ? 'outline' : variant} {...buttonProps} onClick={() => setOpen(true)}>{children}</Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title={title} explanation={explanation} confirmLabel={confirmLabel} variant={variant} busy={busy}
        onConfirm={async () => { setBusy(true); try { await onConfirm(); setOpen(false); } finally { setBusy(false); } }} />
    </>
  );
}

export function ConfirmDialog({ open, onOpenChange, title = 'Are you sure?', explanation, confirmLabel = 'Yes, do it', onConfirm, variant = 'destructive', busy }: {
  open: boolean; onOpenChange: (o: boolean) => void; title?: string; explanation: React.ReactNode; confirmLabel?: string; onConfirm: () => void; variant?: ButtonProps['variant']; busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-base">{explanation}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>No, go back</Button>
          <Button variant={variant} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
