import 'server-only';
import { env } from './env';

export async function slackApi(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = env().SLACK_BOT_TOKEN;
  if (!token) throw new Error('Slack is not set up. Add SLACK_BOT_TOKEN to the .env file.');
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok !== true) throw new Error(slackHint(String(data.error || res.status)));
  return data;
}

function slackHint(code: string) {
  const hints: Record<string, string> = {
    channel_not_found: 'Slack could not find that channel. Check the name, and invite the bot to it (type /invite @your-bot in the channel).',
    not_in_channel: 'The bot is not in that channel yet. In Slack, open the channel and type /invite @your-bot.',
    invalid_auth: 'Slack did not accept the SLACK_BOT_TOKEN in .env. Copy the "Bot User OAuth Token" again (it starts with xoxb-).',
    missing_scope: 'The Slack app needs the chat:write permission. Add it under OAuth & Permissions and reinstall the app.',
  };
  return hints[code] || `Slack said: ${code}`;
}

export async function postSlackMessage(channel: string, text: string): Promise<string> {
  if (!channel) throw new Error('No Slack channel is set. Add one under Settings → Slack.');
  const data = await slackApi('chat.postMessage', { channel, text, mrkdwn: true, unfurl_links: false, unfurl_media: false });
  return String(data.ts);
}
