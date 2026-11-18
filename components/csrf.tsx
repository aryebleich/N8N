'use client';
import * as React from 'react';
import { toast } from 'sonner';

const CsrfContext = React.createContext<string>('');

export function CsrfProvider({ token, children }: { token: string; children: React.ReactNode }) {
  return <CsrfContext.Provider value={token}>{children}</CsrfContext.Provider>;
}

export class ApiClientError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

/** fetch wrapper: JSON in/out, CSRF header, readable errors. */
export function useApi() {
  const csrf = React.useContext(CsrfContext);
  return React.useCallback(
    async function api<T = Record<string, unknown>>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<T> {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const details = Array.isArray(data.details) ? data.details : undefined;
        const detailText = details?.map((d) => (typeof d === 'string' ? d : (d as { message?: string }).message)).filter(Boolean).join(' ');
        throw new ApiClientError(`${String(data.error || `Request failed (${res.status})`)}${detailText ? ` ${detailText}` : ''}`, res.status, data.details);
      }
      return data as T;
    },
    [csrf],
  );
}

/** Runs an async action with a pending flag and toast feedback. */
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
