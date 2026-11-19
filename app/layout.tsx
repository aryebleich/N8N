import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { Shell } from '@/components/sidebar';
import { getSettings } from '@/lib/settings';
import { totalWaiting } from '@/lib/metrics';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Support Assistant', template: '%s · Support Assistant' },
  description: 'Control panel for your Claude + Gemini customer support assistant',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, waiting] = await Promise.all([getSettings(), totalWaiting()]);
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Shell company={settings.company_name} enabled={settings.assistant_enabled} waiting={waiting}>{children}</Shell>
        <Toaster position="bottom-center" richColors closeButton toastOptions={{ style: { fontSize: '15px' } }} />
      </body>
    </html>
  );
}
