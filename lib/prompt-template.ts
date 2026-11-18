/**
 * Prompt templates use {{snake_case}} variables. This module is shared by the editor
 * (highlighting, validation), the test panel and the server routes. The n8n workflow
 * fills the same variables (see n8n/workflows, "Build Request" Code nodes).
 */

export const PROMPT_IDS = ['claude_system', 'gemini_reviewer', 'holding_message', 'email_signature', 'chat_greeting'] as const;
export type PromptId = (typeof PROMPT_IDS)[number];

export const VARIABLE_HELP: Record<string, string> = {
  company_name: 'Company name from Settings',
  customer_name: 'Customer full name, or "there" when unknown',
  first_name: 'Customer first name, or "there" when unknown',
  channel: '"email" or "chat"',
  identity_status: '"verified" or "unverified"',
  account_lookup: '"ok", "not_found", "not_requested" or "unavailable"',
  faq_context: 'Up to 5 FAQ entries retrieved from Turso for this message',
  account_context: 'Verified customer account summary (JSON) or "none"',
  today: 'Current UTC date, YYYY-MM-DD',
};

interface PromptDef {
  name: string;
  description: string;
  allowed: string[];
  required: string[];
  maxLength: number;
}

export const PROMPT_DEFS: Record<PromptId, PromptDef> = {
  claude_system: {
    name: 'Claude system prompt',
    description: 'Drafts the reply. Must return {answer, confidence, needs_human, reason, uses_account_data}.',
    allowed: ['company_name', 'customer_name', 'channel', 'identity_status', 'account_lookup', 'faq_context', 'account_context', 'today'],
    required: ['faq_context'],
    maxLength: 30000,
  },
  gemini_reviewer: {
    name: 'Gemini reviewer prompt',
    description: "Reviews Claude's draft. Must return {agrees, confidence, issues, needs_human}.",
    allowed: ['company_name', 'customer_name', 'channel', 'identity_status', 'account_lookup', 'faq_context', 'account_context', 'today'],
    required: [],
    maxLength: 30000,
  },
  holding_message: {
    name: 'Holding message',
    description: 'Sent to the customer when a conversation goes to a human. Email adds a greeting and the signature.',
    allowed: ['company_name', 'customer_name', 'first_name', 'channel'],
    required: [],
    maxLength: 2000,
  },
  email_signature: {
    name: 'Email signature',
    description: 'Appended to every email reply.',
    allowed: ['company_name'],
    required: [],
    maxLength: 1000,
  },
  chat_greeting: {
    name: 'Chat greeting',
    description: 'First bubble shown in the chat widget.',
    allowed: ['company_name'],
    required: [],
    maxLength: 500,
  },
};

const VAR_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function extractVariables(body: string): string[] {
  return [...new Set([...body.matchAll(VAR_RE)].map((m) => m[1]))];
}

export interface TemplateCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  variables: string[];
}

export function validateTemplate(id: PromptId, body: string): TemplateCheck {
  const def = PROMPT_DEFS[id];
  const errors: string[] = [];
  const warnings: string[] = [];
  const variables = extractVariables(body);

  if (!body.trim()) errors.push('The prompt cannot be empty.');
  if (body.length > def.maxLength) errors.push(`The prompt is ${body.length} characters; the limit is ${def.maxLength}.`);
  for (const v of variables) {
    if (!/^[a-z][a-z0-9_]*$/.test(v)) errors.push(`"{{${v}}}" is not a valid variable name. Use lowercase snake_case.`);
    else if (!def.allowed.includes(v)) errors.push(`{{${v}}} is not available in this prompt. Allowed: ${def.allowed.map((a) => `{{${a}}}`).join(', ')}.`);
  }
  for (const r of def.required) if (!variables.includes(r)) errors.push(`{{${r}}} is required in this prompt.`);
  const opens = (body.match(/\{\{/g) || []).length;
  const closes = (body.match(/\}\}/g) || []).length;
  if (opens !== closes) errors.push('Unbalanced braces: every {{ needs a matching }}.');
  if (/\[\[[A-Z_]+\]\]/.test(body)) warnings.push('Found [[OLD_STYLE]] placeholders. They still work in n8n but use {{snake_case}} for new text.');
  if (id === 'claude_system' && !/needs_human/.test(body)) warnings.push('The prompt does not mention needs_human; the model may never ask for a human.');
  if (id === 'gemini_reviewer' && !/agrees/.test(body)) warnings.push('The prompt does not mention "agrees"; the reviewer output relies on it.');
  return { ok: errors.length === 0, errors, warnings, variables };
}

export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body.replace(VAR_RE, (m, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? m : String(v);
  });
}

export type TemplateToken = { text: string; variable?: { name: string; valid: boolean } };

/** Splits a template into plain text and variable tokens for highlighting. */
export function tokenizeTemplate(id: PromptId, body: string): TemplateToken[] {
  const allowed = PROMPT_DEFS[id].allowed;
  const tokens: TemplateToken[] = [];
  let last = 0;
  for (const m of body.matchAll(VAR_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) tokens.push({ text: body.slice(last, idx) });
    tokens.push({ text: m[0], variable: { name: m[1], valid: allowed.includes(m[1]) } });
    last = idx + m[0].length;
  }
  if (last < body.length) tokens.push({ text: body.slice(last) });
  return tokens;
}
