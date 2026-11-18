import { route } from '@/lib/api';
import { promptTestSchema } from '@/lib/validators';
import { LIMITS } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { getPromptBodies } from '@/lib/prompts';
import { formatFaqContext, retrieveFaq } from '@/lib/faq';
import { runClaude, runGemini, wouldAutoSend } from '@/lib/llm';
import { thresholdFor } from '@/lib/settings-schema';
import { validateTemplate } from '@/lib/prompt-template';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Runs a sample message through Claude then Gemini. Sends nothing to customers, stores nothing but an audit line. */
export const POST = route({ role: 'owner', schema: promptTestSchema, rate: { name: 'prompt-test', ...LIMITS.promptTest } }, async ({ body, actor }) => {
  const [settings, prompts] = await Promise.all([getSettings(), getPromptBodies()]);
  const claudeSystem = body.overrides.claude_system ?? prompts.claude_system;
  const geminiSystem = body.overrides.gemini_reviewer ?? prompts.gemini_reviewer;
  const checks = { claude_system: validateTemplate('claude_system', claudeSystem), gemini_reviewer: validateTemplate('gemini_reviewer', geminiSystem) };
  const faq = await retrieveFaq(body.message, 5);
  const input = { message: body.message, channel: body.channel, customerName: body.customerName, faqContext: formatFaqContext(faq.rows), claudeSystem, geminiSystem };
  const claude = await runClaude(input, settings);
  const gemini = await runGemini(input, claude.parsed, settings);
  const threshold = thresholdFor(settings, body.channel);
  await audit(actor, 'prompt.test', 'prompt', null, null, { channel: body.channel, usedDraft: !!body.overrides.claude_system || !!body.overrides.gemini_reviewer });
  return {
    ok: true,
    retrieval: { method: faq.method, keywords: faq.keywords, faqIds: faq.rows.map((r) => r.id) },
    claude,
    gemini,
    decision: { threshold, ...wouldAutoSend(claude, gemini, threshold) },
    checks,
  };
});
