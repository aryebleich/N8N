import { requireOwner } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/page-header';
import { DataTools } from './data-tools';

export const metadata = { title: 'Data tools' };
export const dynamic = 'force-dynamic';

export default async function DataPage() {
  await requireOwner();
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Data tools" description="Exports, deletion requests and retention. These act on Turso only; Oracle account data is read-only and never changed from here." />
      <DataTools retentionDays={s.retention_days} />
    </>
  );
}
