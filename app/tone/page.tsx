import { getSettings } from '@/lib/settings';
import { getPromptBodies, listVersions } from '@/lib/prompts';
import { PROMPT_IDS, type PromptId } from '@/lib/prompt-template';
import { PageHeader } from '@/components/sidebar';
import { ToneEditor } from './tone-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tone and Rules' };

export default async function TonePage() {
  const [s, prompts] = await Promise.all([getSettings(true), getPromptBodies()]);
  const versions = Object.fromEntries(await Promise.all(PROMPT_IDS.map(async (id) => [id, await listVersions(id)] as const))) as Record<PromptId, Awaited<ReturnType<typeof listVersions>>>;
  return (
    <div>
      <PageHeader title="Tone and Rules" description="How the assistant sounds, and what it must never do. Changes apply to new messages within a minute." />
      <ToneEditor
        key={JSON.stringify([s.tone_style, s.prompt_mode, versions.claude_system[0]?.version])}
        initial={{
          tone_style: s.tone_style, tone_custom: s.tone_custom, never_rules: s.never_rules, never_custom: s.never_custom, company_name: s.company_name,
          email_signature: prompts.email_signature ?? '', chat_greeting: prompts.chat_greeting ?? '', holding_message: prompts.holding_message ?? '',
        }}
        promptMode={s.prompt_mode}
        instructions={prompts.claude_system ?? ''}
        versions={versions}
      />
    </div>
  );
}
