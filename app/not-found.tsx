import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="mt-2 text-muted-foreground">That page or record does not exist, or it was deleted.</p>
        <Link href="/" className="mt-4 inline-block text-primary underline">Back to the dashboard</Link>
      </div>
    </main>
  );
}
