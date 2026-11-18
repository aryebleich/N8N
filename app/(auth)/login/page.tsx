import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/');
  return (
    <div className="rounded-lg border bg-card p-6 shadow-xs">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Use the email and password your owner set up for you.</p>
      <LoginForm />
    </div>
  );
}
