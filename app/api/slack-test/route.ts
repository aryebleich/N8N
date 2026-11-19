import { z } from 'zod';
import { adminRoute, HttpError } from '@/lib/api';
import { postSlackMessage } from '@/lib/slack';
import { SETTINGS_SCHEMA } from '@/lib/settings-schema';

/** "Send a test message" next to the Slack channel setting. */
export const POST = adminRoute(z.object({ channel: SETTINGS_SCHEMA.slack_channel }), async ({ body }) => {
  if (!body.channel) throw new HttpError(400, 'Type a channel name first, like #support.');
  try {
    await postSlackMessage(body.channel, ':wave: Test message from your support assistant admin panel. Alerts that need a person will appear here.');
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  return { ok: true };
});
