import { maskEmail, safeCustomerText } from './mask';

export interface EscalationSummary {
  id: number;
  channel: 'email' | 'chat';
  conversationId: string;
  customerName: string | null;
  customerEmail: string | null;
  verified: boolean;
  accountLookup: string | null;
  reasonCode: string;
  reason: string;
  priority: string;
  claudeConfidence: number | null;
  geminiConfidence: number | null;
  geminiAgrees: boolean | null;
  geminiIssues: string[];
  customerMessage: string;
  claudeDraft: string | null;
  receivedAt: string;
  slaDueAt: string | null;
  link: string;
}

const quote = (s: string, max: number) => {
  const t = s.slice(0, max);
  return t.split('\n').map((l) => `> ${l}`).join('\n') + (s.length > max ? '\n> …' : '');
};

/** Slack mrkdwn summary. Only the verified customer's own email is shown in full. */
export function formatEscalationForSlack(e: EscalationSummary): string {
  const keep = e.verified ? e.customerEmail : null;
  const parts = (e.customerName || '').trim().split(/\s+/).filter(Boolean);
  const name = parts.length ? `${parts[0]}${parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : ''}` : 'Unknown name';
  const shownEmail = keep || (e.customerEmail ? maskEmail(e.customerEmail) : 'no email');
  const fmt = (n: number | null) => (n == null ? 'n/a' : n.toFixed(2));
  const issues = e.geminiIssues.length ? e.geminiIssues.map((i) => `• ${safeCustomerText(i, keep)}`).join('\n') : '• none reported';
  return [
    `:rotating_light: *Escalation #${e.id}* · ${e.channel === 'email' ? ':email: Email' : ':speech_balloon: Chat'} · priority *${e.priority}* · \`${e.reasonCode}\``,
    `*Customer:* ${name} <${shownEmail}> · ${e.verified ? 'verified' : 'unverified'}${e.accountLookup ? ` · account_lookup \`${e.accountLookup}\`` : ''}`,
    `*Reason:* ${safeCustomerText(e.reason, keep).slice(0, 600)}`,
    `*Claude confidence:* ${fmt(e.claudeConfidence)} · *Gemini confidence:* ${fmt(e.geminiConfidence)}${e.geminiAgrees == null ? '' : ` (agrees: ${e.geminiAgrees})`}`,
    `*Gemini issues:*\n${issues}`,
    `*Customer message:*\n${quote(safeCustomerText(e.customerMessage, keep), 1500)}`,
    `*Claude draft:*\n${e.claudeDraft ? quote(safeCustomerText(e.claudeDraft, keep), 1500) : '> (no usable draft)'}`,
    `*Received:* ${e.receivedAt}${e.slaDueAt ? ` · *SLA due:* ${e.slaDueAt}` : ''}`,
    `<${e.link}|Open in the admin console>`,
  ].join('\n');
}
