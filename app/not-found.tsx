import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">This page does not exist</h1>
      <p className="mt-2 text-muted-foreground">It may have been removed, or the link is wrong.</p>
      <Button asChild className="mt-6"><Link href="/">Go to Home</Link></Button>
    </div>
  );
}
