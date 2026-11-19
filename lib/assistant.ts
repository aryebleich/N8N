import 'server-only';
import { env } from './env';
import { retrieveFaq, formatFaqContext, extractKeywords, type FaqRow } from './faq';
import { getPromptBodies } from './prompts';
import { getSettings } from './settings';
import { renderTemplate } from './prompt-template';
import { runClaude, runGemini, type ClaudeOutput, type GeminiOutput, type ModelRun } from './llm';
import { decide, type Decision, type ModelVerdict } from './policy';
import { whyFor } from './why';
import { sendEmail, textToHtml, emailConfigured } from './mailer';
import { postSlackMessage } from './slack';
import type { Settings } from './settings-schema';

/**
 * The Test Center. Runs one question through the same steps as the n8n workflow:
 * find matching answers → Claude drafts → Gemini checks → the decision rules.
 * Uses the real AIs when their keys are in .env; otherwise a clearly labelled
 * offline simulator that works from your answers only.
 */

export type Engine = 'real' | 'simulator';

export interface AiSummary {
  name: 'Claude' | 'Gemini';
  role: string;
  engine: Engine;
  ok: boolean;
  confidence: number | null;
  needsHuman: boolean;
  agrees?: boolean;
  text: string;
  issues: string[];
  error: string | null;
  latencyMs: number;
  model: string;
}

export interface TestResult {
  engines: { claude: Engine; gemini: Engine };
  claude: AiSummary;
  gemini: AiSummary;
  decision: Decision;
  why: { title: string; text: string };
  customerWouldGet: string;
  faqUsed: { id: number; question: string }[];
  responseMs: number;
  under10s: boolean;
  live: { mode: boolean; emailedTo: string | null; slackPosted: boolean; notes: string[] };
}

// ------------------------------------------------------------------ simulator
function overlap(message: string, faq: FaqRow): number {
  const words = extractKeywords(message);
  if (!words.length) return 0;
  const hay = `${faq.question} ${faq.tags} ${faq.answer}`.toLowerCase();
  return words.filter((w) => hay.includes(w)).length / words.length;
}

export function simulateClaude(message: string, faqs: FaqRow[], firstName: string): ModelRun<ClaudeOutput> {
  const top = faqs[0];
  if (!top) {
    return {
      ok: true, raw: '', error: null, latencyMs: 0, model: 'offline simulator',
      parsed: { answer: `Thanks for your message${firstName ? `, ${firstName}` : ''}. A teammate will look into this and reply soon.`, confidence: 0.3, needs_human: true, reason: 'None of your answers match this question.', uses_account_data: false },
    };
  }
  const score = overlap(message, top);
  const confidence = Math.round(Math.min(0.95, 0.6 + 0.35 * score) * 100) / 100;
  return {
    ok: true, raw: '', error: null, latencyMs: 0, model: 'offline simulator',
    parsed: { answer: top.answer, confidence, needs_human: confidence < 0.6, reason: `Based on your answer "${top.question}".`, uses_account_data: false },
  };
}

export function simulateGemini(draft: ClaudeOutput | null): ModelRun<GeminiOutput> {
  const c = draft?.confidence ?? 0;
  const agrees = !!draft && !draft.needs_human && c >= 0.8;
  return {
    ok: true, raw: '', error: null, latencyMs: 0, model: 'offline simulator',
    parsed: { agrees, confidence: Math.max(0, Math.round((c - 0.02) * 100) / 100), issues: agrees ? [] : ['The draft is not clearly supported by your answers.'], needs_human: !agrees },
  };
}

const toVerdict = (r: ModelRun<ClaudeOutput | GeminiOutput>): ModelVerdict =>
  r.ok && r.parsed ? ({ ...(r.parsed as object), valid: true } as ModelVerdict) : { valid: false, confidence: 0, needs_human: true, error: r.error };

function summary(name: 'Claude' | 'Gemini', engine: Engine, r: ModelRun<ClaudeOutput> | ModelRun<GeminiOutput>): AiSummary {
  const p = r.parsed as (ClaudeOutput & GeminiOutput) | null;
  return {
    name, engine, ok: r.ok && !!p, role: name === 'Claude' ? 'Writes the answer' : 'Checks the answer',
    confidence: p ? p.confidence : null, needsHuman: p ? p.needs_human : true, agrees: name === 'Gemini' ? !!p?.agrees : undefined,
    text: name === 'Claude' ? (p?.answer ?? '') : p ? (p.agrees ? 'Agrees with the answer.' : 'Does not agree with the answer.') : '',
    issues: name === 'Gemini' ? (p?.issues ?? []) : p?.reason ? [p.reason] : [],
    error: r.error, latencyMs: r.latencyMs, model: r.model,
  };
}

function customerReply(s: Settings, prompts: Record<string, string>, d: Decision, draft: string, channel: 'email' | 'chat', firstName: string) {
  const vars = { company_name: s.company_name, customer_name: firstName || 'there', first_name: firstName || 'there', channel };
  const body = d.auto
    ? draft
    : renderTemplate(d.reasonCode === 'outside_hours' && s.business_hours.outside_message.trim() ? s.business_hours.outside_message : prompts.holding_message || '', vars).trim();
  if (channel === 'chat') return body;
  return `${firstName ? `Hi ${firstName},` : 'Hi,'}\n\n${body}\n\n${renderTemplate(prompts.email_signature || '', vars).trim()}`;
}

export async function runTest(input: { message: string; channel: 'email' | 'chat'; live: boolean; liveEmail?: string }): Promise<TestResult> {
  const started = Date.now();
  const [settings, prompts] = await Promise.all([getSettings(true), getPromptBodies()]);
  const e = env();
  const firstName = '';
  const faq = await retrieveFaq(input.message);
  const faqContext = formatFaqContext(faq.rows);
  const llmInput = { message: input.message, channel: input.channel, customerName: '', faqContext, claudeSystem: prompts.claude_system || '', geminiSystem: prompts.gemini_reviewer || '' };

  const engines = { claude: (e.ANTHROPIC_API_KEY ? 'real' : 'simulator') as Engine, gemini: (e.GOOGLE_AI_API_KEY ? 'real' : 'simulator') as Engine };
  const claude = engines.claude === 'real' ? await runClaude(llmInput, settings) : simulateClaude(input.message, faq.rows, firstName);
  const gemini = engines.gemini === 'real' ? await runGemini(llmInput, claude.parsed, settings) : simulateGemini(claude.parsed);

  const decision = decide({ settings, channel: input.channel, message: input.message, customerEmail: input.liveEmail || null, claude: toVerdict(claude), gemini: toVerdict(gemini) });
  const reply = customerReply(settings, prompts, decision, claude.parsed?.answer ?? '', input.channel, firstName);

  const live: TestResult['live'] = { mode: input.live, emailedTo: null, slackPosted: false, notes: [] };
  if (input.live) {
    if (input.liveEmail && emailConfigured()) {
      try {
        await sendEmail({ to: input.liveEmail, subject: `[Test] ${input.message.slice(0, 60)}`, text: reply, html: textToHtml(reply), automated: true });
        live.emailedTo = input.liveEmail;
      } catch (err) {
        live.notes.push(`The email was not sent: ${(err as Error).message}`);
      }
    } else if (input.liveEmail) {
      live.notes.push('Email sending is not set up in .env, so no email was sent.');
    }
    if (!decision.auto) {
      if (e.SLACK_BOT_TOKEN && settings.slack_channel) {
        try {
          await postSlackMessage(settings.slack_channel, `:test_tube: *Test from the admin panel* — the assistant would ask a person.\n*Why:* ${whyFor(decision.reasonCode).title}\n*Question:* ${input.message.slice(0, 500)}`);
          live.slackPosted = true;
        } catch (err) {
          live.notes.push(`Slack message not sent: ${(err as Error).message}`);
        }
      } else {
        live.notes.push('Slack is not set up, so no "ask a person" alert was sent.');
      }
    }
  }

  const responseMs = Date.now() - started;
  return {
    engines,
    claude: summary('Claude', engines.claude, claude),
    gemini: summary('Gemini', engines.gemini, gemini),
    decision,
    why: whyFor(decision.reasonCode),
    customerWouldGet: reply,
    faqUsed: faq.rows.map((r) => ({ id: Number(r.id), question: r.question })),
    responseMs,
    under10s: responseMs < 10_000,
    live,
  };
}
