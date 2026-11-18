import { AcceptInviteForm } from './accept-form';

export const metadata = { title: 'Set your password' };
export const dynamic = 'force-dynamic';

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="rounded-lg border bg-card p-6 shadow-xs">
      <h1 className="text-xl font-semibold">Set your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choose a password with at least 12 characters, letters and a digit.</p>
      {token ? <AcceptInviteForm token={token} /> : <p className="mt-4 text-sm text-destructive">This link is missing its token. Open the link from your email again.</p>}
    </div>
  );
}
