import { route, ApiError } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import { postSlackMessage } from '@/lib/slack';
import { recordStatus } from '@/lib/health';
import { audit } from '@/lib/audit';
import { LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export const POST = route({ role: 'owner', rate: { name: 'slack-test', ...LIMITS.integrationTest } }, async ({ actor }) => {
  const s = await getSettings();
  if (!s.slack_channel_id) throw new ApiError(400, 'Set the Slack channel ID first.');
  const started = Date.now();
  try {
    const ts = await postSlackMessage(s.slack_channel_id, `:white_check_mark: Test message from the ${s.company_name} support console. Escalations will appear in this channel.`);
    await recordStatus('slack', true, Date.now() - started, null);
    await audit(actor, 'settings.slack_test', 'settings', 'slack_channel_id', null, { ok: true });
    return { ok: true, ts };
  } catch (e) {
    await recordStatus('slack', false, Date.now() - started, (e as Error).message);
    throw new ApiError(502, (e as Error).message);
  }
});
