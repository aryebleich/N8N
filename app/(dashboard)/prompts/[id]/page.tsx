import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getPrompt, listVersions } from '@/lib/prompts';
import { PROMPT_DEFS, PROMPT_IDS, VARIABLE_HELP, type PromptId } from '@/lib/prompt-template';
import { PageHeader } from '@/components/page-header';
import { PromptEditor } from './prompt-editor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: (PROMPT_DEFS as Record<string, { name: string }>)[id]?.name ?? 'Prompt' };
}

export default async function PromptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!(PROMPT_IDS as readonly string[]).includes(id)) notFound();
  const pid = id as PromptId;
  const [prompt, versions] = await Promise.all([getPrompt(pid), listVersions(pid)]);
  if (!prompt) notFound();
  const def = PROMPT_DEFS[pid];
  return (
    <>
      <Link href="/prompts" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Prompts</Link>
      <PageHeader title={def.name} description={def.description} />
      <PromptEditor
        id={pid}
        canEdit={user.role === 'owner'}
        initialBody={prompt.body}
        version={prompt.version}
        allowed={def.allowed.map((v) => ({ name: v, help: VARIABLE_HELP[v] ?? '' }))}
        required={def.required}
        versions={versions.map((v) => ({ version: v.version, body: v.body, changedAt: v.changed_at, changedBy: v.changed_by_email ?? v.changed_by ?? 'system', note: v.note }))}
        testable={pid === 'claude_system' || pid === 'gemini_reviewer'}
      />
    </>
  );
}
