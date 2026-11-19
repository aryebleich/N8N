import { getSettings } from '@/lib/settings';
import { recentDecisionSamples } from '@/lib/metrics';
import { env } from '@/lib/env';
import { PageHeader } from '@/components/sidebar';
import { ServiceStatusList } from '@/components/service-status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const [settings, samples] = await Promise.all([getSettings(true), recentDecisionSamples()]);
  const e = env();
  const attrs = [
    `src="${e.WIDGET_SCRIPT_URL}"`,
    `data-webhook-url="${e.N8N_CHAT_WEBHOOK_URL || 'https://YOUR-N8N-SERVER/webhook/support-chat'}"`,
    `data-site-url="${e.APP_URL}"`,
    `data-title="${settings.company_name.replace(/"/g, '&quot;')} support"`,
  ];
  const widgetCode = `<script ${attrs.join('\n        ')}\n        defer></script>`;
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="When the assistant may answer by itself, your opening hours, and where alerts go." />
      <SettingsForm
        key={JSON.stringify(settings)}
        initial={settings}
        samples={samples}
        widgetCode={widgetCode}
        widgetReady={!!e.N8N_CHAT_WEBHOOK_URL}
        slackReady={!!e.SLACK_BOT_TOKEN}
      />
      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
          <CardDescription>Keys for Claude, Gemini, Slack, Oracle and email live in the .env file on the server. They are never shown or typed here.</CardDescription>
        </CardHeader>
        <CardContent><ServiceStatusList /></CardContent>
      </Card>
    </div>
  );
}
