'use client';
import { Button } from '@/components/ui/button';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-xl font-semibold">This page could not load</h1>
      <p className="mt-2 text-sm text-muted-foreground">The server reported an error{error.digest ? ` (reference ${error.digest})` : ''}. Check that the database is reachable, then try again.</p>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
