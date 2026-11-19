'use client';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong on this page</h1>
      <p className="mt-2 text-muted-foreground">Try again. If it keeps happening, look at the server window for the error{error.digest ? ` (code ${error.digest})` : ''}.</p>
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </div>
  );
}
