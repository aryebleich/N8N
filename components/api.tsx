'use client';
import * as React from 'react';
import { toast } from 'sonner';

/** fetch wrapper for the panel's own API: JSON in and out, plain-language errors. */
export async function api<T = Record<string, unknown>>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new Error('The panel could not reach its server. Is it still running?');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error || `Something went wrong (error ${res.status}).`));
  return data as T;
}

/** Runs an async action with a "pending" flag and a toast on success or failure. */
export function useAction() {
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setPending(true);
    try {
      const out = await fn();
      if (success) toast.success(success);
      return out;
    } catch (e) {
      toast.error((e as Error).message);
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, run };
}

/** "Saved. Undo" toast that stays for 10 seconds. */
export function savedWithUndo(message: string, undo: () => Promise<unknown>, after?: () => void) {
  toast.success(message, {
    duration: 10_000,
    action: {
      label: 'Undo',
      onClick: () => {
        undo()
          .then(() => { toast.success('Undone. The previous version is back.'); after?.(); })
          .catch((e: Error) => toast.error(e.message));
      },
    },
  });
}
