import { listAnswers } from '@/lib/faq-admin';
import { getPromptBodies } from '@/lib/prompts';
import { getSettings } from '@/lib/settings';
import { renderTemplate } from '@/lib/prompt-template';
import { PageHeader } from '@/components/sidebar';
import { AnswersManager } from './answers-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Answers (FAQ)' };

export default async function AnswersPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const [answers, prompts, settings, sp] = await Promise.all([listAnswers(), getPromptBodies(), getSettings(), searchParams]);
  return (
    <div>
      <PageHeader title="Answers (FAQ)" description="The assistant only answers from what is written here. Add the questions customers ask most, in your own words." />
      <AnswersManager
        initial={answers.map((a) => ({ ...a, id: Number(a.id), active: Number(a.active) }))}
        openNew={sp.new === '1'}
        signature={renderTemplate(prompts.email_signature || '', { company_name: settings.company_name })}
      />
    </div>
  );
}
