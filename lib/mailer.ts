import 'server-only';
import nodemailer from 'nodemailer';
import { getSettings } from './settings';
import { getSecret } from './secrets';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string | null;
  references?: string[];
  /** true for workflow replies (adds Auto-Submitted: auto-replied, RFC 3834). */
  automated?: boolean;
}

export async function smtpTransport() {
  const s = await getSettings();
  const cfg = s.integration_smtp;
  if (!cfg.host || !cfg.user) throw new Error('SMTP is not configured. Add the host and user under Integrations.');
  const pass = await getSecret('smtp_password');
  if (!pass) throw new Error('SMTP password is missing. Add it under Integrations.');
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  const fromAddress = s.support_from_email || cfg.user;
  return { transport, from: `"${s.company_name.replace(/"/g, '')} Support" <${fromAddress}>`, replyTo: fromAddress };
}

/** Sends with In-Reply-To / References so the reply threads in the customer's mail client. */
export async function sendEmail(mail: OutgoingEmail): Promise<{ messageId: string }> {
  const { transport, from, replyTo } = await smtpTransport();
  const info = await transport.sendMail({
    from,
    replyTo,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html || undefined,
    inReplyTo: mail.inReplyTo || undefined,
    references: mail.references && mail.references.length ? mail.references : undefined,
    headers: mail.automated ? { 'Auto-Submitted': 'auto-replied' } : undefined,
  });
  return { messageId: info.messageId };
}
