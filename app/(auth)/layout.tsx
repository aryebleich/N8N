export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="size-8" aria-hidden><rect width="32" height="32" rx="7" className="fill-primary" /><path d="M8 10h16v10H13l-5 4z" fill="none" stroke="white" strokeWidth="2.4" strokeLinejoin="round" /></svg>
          <span className="text-lg font-semibold tracking-tight">Support Console</span>
        </div>
        {children}
      </div>
    </main>
  );
}
