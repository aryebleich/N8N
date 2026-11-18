import { requireOwner } from '@/lib/auth';
import { getSettings, getSettingsMeta } from '@/lib/settings';
import { decisionSamples } from '@/lib/metrics';
import { getPromptBodies } from '@/lib/prompts';
import { renderTemplate } from '@/lib/prompt-template';
import { env } from '@/lib/env';
import { all } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { SettingsForm } from './settings-form';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireOwner();
  const [settings, meta, samples, prompts, killLog] = await Promise.all([
    getSettings(),
    getSettingsMeta(),
    decisionSamples(),
    getPromptBodies(),
    all<{ entity_id: string; new_json: string; actor_email: string | null; created_at: string }>(
      "SELECT entity_id, new_json, actor_email, created_at FROM audit_log WHERE action = 'settings.kill_switch' ORDER BY id DESC LIMIT 6",
    ),
  ]);
  const e = env();
  return (
    <>
      <PageHeader title="Settings" description="Everything the workflow reads at runtime. Changes reach n8n within 30 seconds; each one is written to the audit log." />
      <SettingsForm
        settings={settings}
        updatedAt={Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, v.updated_at]))}
        samples={samples}
        signature={renderTemplate(prompts.email_signature || '', { company_name: settings.company_name })}
        urls={{
          chatWebhook: e.N8N_CHAT_WEBHOOK_URL || '(set N8N_CHAT_WEBHOOK_URL)',
          sendReply: `${e.APP_URL}/api/internal/send-reply`,
          escalate: `${e.APP_URL}/api/internal/escalate`,
          widgetConfig: `${e.APP_URL}/api/public/widget-config`,
        }}
        killLog={killLog.map((k) => ({ key: k.entity_id, value: k.new_json === 'true', by: k.actor_email ?? 'system', at: k.created_at }))}
      />
    </>
  );
}
