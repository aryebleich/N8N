import { env } from '@/lib/env';
import { PageHeader } from '@/components/sidebar';
import { TestCenter } from './test-center';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Test Center' };

export default function TestPage() {
  const e = env();
  return (
    <div>
      <PageHeader title="Test Center" description="Ask the assistant a question, exactly like a customer would, and see what it would do and why." />
      <TestCenter realClaude={!!e.ANTHROPIC_API_KEY} realGemini={!!e.GOOGLE_AI_API_KEY} emailReady={!!(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASSWORD)} />
    </div>
  );
}
