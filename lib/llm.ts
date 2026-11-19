import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';
import { renderTemplate } from './prompt-template';
import type { Settings } from './settings-schema';

/**
 * Test Center runner. Builds the same requests as the n8n workflow
 * ("🤖 Claude: Build Request" and "🔎 Gemini: Build Request") and parses the
 * same strict JSON. Nothing is sent to customers and nothing is stored.
 */

export interface TestInput {
  message: string;
  channel: 'email' | 'chat';
  customerName: string;
  faqContext: string;
  claudeSystem: string;
  geminiSystem: string;
}

export interface ModelRun<T> {
  ok: boolean;
  parsed: T | null;
  raw: string;
  error: string | null;
  latencyMs: number;
  model: string;
  stopReason?: string | null;
}

export interface ClaudeOutput {
  answer: string;
  confidence: number;
  needs_human: boolean;
  reason: string;
  uses_account_data: boolean;
}
export interface GeminiOutput {
  agrees: boolean;
  confidence: number;
  issues: string[];
  needs_human: boolean;
}

const CLAUDE_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    confidence: { type: 'number' },
    needs_human: { type: 'boolean' },
    reason: { type: 'string' },
    uses_account_data: { type: 'boolean' },
  },
  required: ['answer', 'confidence', 'needs_human', 'reason', 'uses_account_data'],
  additionalProperties: false,
} as const;

function vars(input: TestInput, settings: Settings) {
  return {
    company_name: settings.company_name,
    customer_name: input.customerName || 'there',
    channel: input.channel,
    identity_status: 'unverified',
    account_lookup: 'not_requested',
    faq_context: input.faqContext,
    account_context: 'none',
    today: new Date().toISOString().slice(0, 10),
  };
}

const CUSTOMER_CONTEXT = JSON.stringify({ identity: 'unverified', account_lookup: 'not_requested', customer: null, note: 'Test run: no account data.' }, null, 2);

function userTurn(input: TestInput): string {
  return [
    'CUSTOMER_CONTEXT (labeled account data for the verified customer only):',
    '<customer_context>',
    CUSTOMER_CONTEXT,
    '</customer_context>',
    '',
    'CONVERSATION_HISTORY (oldest first):',
    '<conversation_history>',
    '(No earlier messages in this conversation.)',
    '</conversation_history>',
    '',
    `CUSTOMER_MESSAGE (channel: ${input.channel}; name: ${input.customerName || 'unknown'}; subject: ${input.channel === 'chat' ? 'Website chat' : 'Test email'}):`,
    '<customer_message>',
    input.message,
    '</customer_message>',
    '',
    'Write the draft reply now and return only the JSON object.',
  ].join('\n');
}

function parseClaude(text: string): ClaudeOutput {
  const p = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
  if (typeof p.answer !== 'string' || typeof p.confidence !== 'number' || typeof p.needs_human !== 'boolean' || typeof p.reason !== 'string' || typeof p.uses_account_data !== 'boolean') {
    throw new Error('JSON does not match {answer, confidence, needs_human, reason, uses_account_data}');
  }
  return { ...p, confidence: Math.max(0, Math.min(1, p.confidence)) };
}

function parseGemini(text: string): GeminiOutput {
  const p = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
  if (typeof p.agrees !== 'boolean' || typeof p.confidence !== 'number' || !Array.isArray(p.issues) || typeof p.needs_human !== 'boolean') {
    throw new Error('JSON does not match {agrees, confidence, issues, needs_human}');
  }
  return { ...p, confidence: Math.max(0, Math.min(1, p.confidence)), issues: p.issues.map(String) };
}

export async function runClaude(input: TestInput, settings: Settings): Promise<ModelRun<ClaudeOutput>> {
  const started = Date.now();
  const model = settings.claude_model;
  const apiKey = env().ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, parsed: null, raw: '', error: 'ANTHROPIC_API_KEY is not in the .env file.', latencyMs: 0, model };
  const client = new Anthropic({ apiKey, timeout: settings.request_timeout_ms, maxRetries: 2 });
  try {
    const res = await client.beta.messages.create({
      model,
      max_tokens: settings.max_tokens,
      system: renderTemplate(input.claudeSystem, vars(input, settings)),
      messages: [{ role: 'user', content: userTurn(input) }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: CLAUDE_SCHEMA as unknown as Record<string, unknown> } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    const raw = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    if (res.stop_reason === 'refusal') return { ok: false, parsed: null, raw, error: 'Claude declined this request (refusal).', latencyMs: Date.now() - started, model: res.model, stopReason: res.stop_reason };
    if (res.stop_reason === 'max_tokens') return { ok: false, parsed: null, raw, error: 'Claude hit MAX_TOKENS before finishing the JSON. Raise max_tokens.', latencyMs: Date.now() - started, model: res.model, stopReason: res.stop_reason };
    try {
      return { ok: true, parsed: parseClaude(raw), raw, error: null, latencyMs: Date.now() - started, model: res.model, stopReason: res.stop_reason };
    } catch (e) {
      return { ok: false, parsed: null, raw, error: `Malformed JSON: ${(e as Error).message}`, latencyMs: Date.now() - started, model: res.model, stopReason: res.stop_reason };
    }
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return { ok: false, parsed: null, raw: '', error: `Anthropic API ${err.status ? `HTTP ${err.status}: ` : ''}${err.message || 'request failed'}`, latencyMs: Date.now() - started, model };
  }
}

export async function runGemini(input: TestInput, draft: ClaudeOutput | null, settings: Settings): Promise<ModelRun<GeminiOutput>> {
  const started = Date.now();
  const model = settings.gemini_model;
  const apiKey = env().GOOGLE_AI_API_KEY;
  if (!apiKey) return { ok: false, parsed: null, raw: '', error: 'GOOGLE_AI_API_KEY is not in the .env file.', latencyMs: 0, model };
  const userText = [
    'KNOWLEDGE_BASE:', '<knowledge_base>', input.faqContext, '</knowledge_base>', '',
    'CUSTOMER_CONTEXT:', '<customer_context>', CUSTOMER_CONTEXT, '</customer_context>', '',
    'CONVERSATION_HISTORY:', '<conversation_history>', '(none)', '</conversation_history>', '',
    'CUSTOMER_MESSAGE:', '<customer_message>', input.message, '</customer_message>', '',
    'DRAFT (written by the drafting model; its own assessment follows):', '<draft>', draft?.answer ?? '(no draft)', '</draft>',
    `Drafting model confidence: ${draft?.confidence ?? 0}; needs_human: ${draft?.needs_human ?? true}; uses_account_data: ${draft?.uses_account_data ?? false}; reason: ${draft?.reason ?? ''}`,
    '', 'Review the draft and return only the JSON object.',
  ].join('\n');
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(settings.request_timeout_ms),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: renderTemplate(input.geminiSystem, vars(input, settings)) }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: { agrees: { type: 'BOOLEAN' }, confidence: { type: 'NUMBER' }, issues: { type: 'ARRAY', items: { type: 'STRING' } }, needs_human: { type: 'BOOLEAN' } },
            required: ['agrees', 'confidence', 'issues', 'needs_human'],
          },
        },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      error?: { message?: string };
      promptFeedback?: { blockReason?: string };
    };
    if (!res.ok) return { ok: false, parsed: null, raw: JSON.stringify(data).slice(0, 2000), error: `Google AI Studio HTTP ${res.status}: ${data.error?.message || res.statusText}`, latencyMs: Date.now() - started, model };
    if (data.promptFeedback?.blockReason) return { ok: false, parsed: null, raw: '', error: `Gemini blocked the prompt: ${data.promptFeedback.blockReason}`, latencyMs: Date.now() - started, model };
    const cand = data.candidates?.[0];
    const raw = (cand?.content?.parts || []).filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
    try {
      return { ok: true, parsed: parseGemini(raw), raw, error: null, latencyMs: Date.now() - started, model, stopReason: cand?.finishReason ?? null };
    } catch (e) {
      return { ok: false, parsed: null, raw, error: `Malformed JSON: ${(e as Error).message}`, latencyMs: Date.now() - started, model, stopReason: cand?.finishReason ?? null };
    }
  } catch (e) {
    return { ok: false, parsed: null, raw: '', error: `Google AI Studio unreachable: ${(e as Error).message}`, latencyMs: Date.now() - started, model };
  }
}
