import 'server-only';
import nodemailer from 'nodemailer';
import { env } from './env';
import { getSettings } from './settings';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string | null;
  references?: string[];
  /** true for automatic replies (adds Auto-Submitted: auto-replied, RFC 3834). */
  automated?: boolean;
}

export function emailConfigured() {
  const e = env();
  return !!(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASSWORD);
}

export async function smtpTransport() {
  const e = env();
  if (!e.SMTP_HOST || !e.SMTP_USER || !e.SMTP_PASSWORD) throw new Error('Email sending is not set up. Add SMTP_HOST, SMTP_USER and SMTP_PASSWORD to the .env file.');
  const s = await getSettings();
  const transport = nodemailer.createTransport({
    host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_SECURE === 'true', auth: { user: e.SMTP_USER, pass: e.SMTP_PASSWORD },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  const fromAddress = e.SMTP_FROM || s.support_from_email || e.SMTP_USER;
  return { transport, from: `"${s.company_name.replace(/"/g, '')} Support" <${fromAddress}>`, replyTo: fromAddress };
}

/** Sends with In-Reply-To / References so the reply threads in the customer's mail app. */
export async function sendEmail(mail: OutgoingEmail): Promise<{ messageId: string }> {
  const { transport, from, replyTo } = await smtpTransport();
  const info = await transport.sendMail({
    from, replyTo, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html || undefined,
    inReplyTo: mail.inReplyTo || undefined,
    references: mail.references && mail.references.length ? mail.references : undefined,
    headers: mail.automated ? { 'Auto-Submitted': 'auto-replied' } : undefined,
  });
  return { messageId: info.messageId };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const textToHtml = (text: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2328">${text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
