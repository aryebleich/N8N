import 'server-only';
import { getSecret } from './secrets';

export async function slackApi(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = await getSecret('slack_bot_token');
  if (!token) throw new Error('Slack bot token is missing. Add it under Integrations.');
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok !== true) throw new Error(`Slack ${method} failed: ${String(data.error || res.status)}`);
  return data;
}

export async function postSlackMessage(channel: string, text: string): Promise<string> {
  if (!channel) throw new Error('Slack channel ID is not set. Add it under Settings.');
  const data = await slackApi('chat.postMessage', { channel, text, mrkdwn: true, unfurl_links: false, unfurl_media: false });
  return String(data.ts);
}
