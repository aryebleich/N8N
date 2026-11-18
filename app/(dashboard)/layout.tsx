import { requireUser } from '@/lib/auth';
import { get } from '@/lib/db';
import { CsrfProvider } from '@/components/csrf';
import { Nav } from '@/components/nav';
import { SignOutButton } from '@/components/sign-out-button';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const open = await get<{ n: number }>("SELECT count(*) AS n FROM escalations WHERE status IN ('open', 'in_progress')");
  return (
    <CsrfProvider token={user.csrfToken}>
      <div className="grid min-h-dvh md:grid-cols-[15rem_1fr]">
        <aside className="border-b bg-card md:border-b-0 md:border-r">
          <div className="flex items-center justify-between gap-2 px-4 py-4 md:block">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 32 32" className="size-7" aria-hidden><rect width="32" height="32" rx="7" className="fill-primary" /><path d="M8 10h16v10H13l-5 4z" fill="none" stroke="white" strokeWidth="2.4" strokeLinejoin="round" /></svg>
              <span className="font-semibold tracking-tight">Support Console</span>
            </div>
          </div>
          <div className="px-2 pb-4 md:pb-0">
            <Nav role={user.role} openEscalations={Number(open?.n ?? 0)} />
          </div>
          <div className="hidden border-t px-4 py-3 text-xs md:mt-6 md:block">
            <p className="truncate font-medium" title={user.email}>{user.name || user.email}</p>
            <p className="mb-2 text-muted-foreground">{user.role === 'owner' ? 'Owner' : 'Agent'}</p>
            <SignOutButton />
          </div>
        </aside>
        <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </CsrfProvider>
  );
}
