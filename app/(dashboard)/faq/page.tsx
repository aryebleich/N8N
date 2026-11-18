import { requireUser } from '@/lib/auth';
import { allTags, listFaq } from '@/lib/faq-admin';
import { getSettings } from '@/lib/settings';
import { getPromptBodies } from '@/lib/prompts';
import { renderTemplate } from '@/lib/prompt-template';
import { PageHeader } from '@/components/page-header';
import { FaqManager } from './faq-manager';

export const metadata = { title: 'Knowledge base' };
export const dynamic = 'force-dynamic';

export default async function FaqPage() {
  const user = await requireUser();
  const [rows, tags, settings, prompts] = await Promise.all([listFaq(), allTags(), getSettings(), getPromptBodies()]);
  const signature = renderTemplate(prompts.email_signature || '', { company_name: settings.company_name });
  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="FAQ entries Claude and Gemini answer from. The workflow searches these on every message, so edits apply to the next message with no redeploy."
      />
      <FaqManager
        canEdit={user.role === 'owner'}
        rows={rows.map((r) => ({ id: r.id, question: r.question, answer: r.answer, tags: r.tags, active: r.active === 1, updatedAt: r.updated_at }))}
        tags={tags}
        signature={signature}
      />
    </>
  );
}
