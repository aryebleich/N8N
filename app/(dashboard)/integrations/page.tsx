import { requireOwner } from '@/lib/auth';
import { listStatus, SERVICE_LABELS } from '@/lib/health';
import { listSecretInfo } from '@/lib/secrets';
import { getSettings } from '@/lib/settings';
import { SERVICES } from '@/lib/validators';
import { PageHeader } from '@/components/page-header';
import { IntegrationCards } from './integration-cards';

export const metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  await requireOwner();
  const [status, secrets, settings] = await Promise.all([listStatus(), listSecretInfo(), getSettings()]);
  const byService = new Map(status.map((s) => [s.service, s]));
  return (
    <>
      <PageHeader title="Integrations" description="Connection health and credentials. Keys are encrypted with AES-256-GCM and never shown again after saving; only the last 4 characters are displayed." />
      <IntegrationCards
        services={SERVICES.map((s) => ({ service: s, label: SERVICE_LABELS[s], status: byService.get(s) ?? null }))}
        secrets={secrets}
        config={{ oracle: settings.integration_oracle, imap: settings.integration_imap, smtp: settings.integration_smtp }}
      />
    </>
  );
}
