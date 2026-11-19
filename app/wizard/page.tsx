import { getSettings } from '@/lib/settings';
import { all } from '@/lib/db';
import { Wizard } from './wizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Get started' };

export default async function WizardPage() {
  const [s, count] = await Promise.all([getSettings(true), all<{ n: number }>('SELECT count(*) AS n FROM faq')]);
  return <Wizard initial={{ company_name: s.company_name, support_from_email: s.support_from_email, business_hours: s.business_hours }} answerCount={Number(count[0]?.n ?? 0)} />;
}
