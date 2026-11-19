import { adminRoute, HttpError } from '@/lib/api';
import { runTest } from '@/lib/assistant';
import { testSchema } from '@/lib/validators';

export const maxDuration = 60;

export const POST = adminRoute(testSchema, async ({ body }) => {
  if (body.live && !body.liveEmail) throw new HttpError(400, 'Live mode sends a real email. Type your own email address first.');
  return runTest({ message: body.message, channel: body.channel, live: body.live, liveEmail: body.liveEmail || undefined });
});
