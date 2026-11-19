import { Badge } from '@/components/ui/badge';
import type { Bucket } from '@/lib/conversations';

export const BUCKET_LABEL: Record<Bucket, string> = { auto: 'Answered automatically', waiting: 'Waiting for a person', done: 'Resolved' };

export function ConversationBadge({ bucket }: { bucket: Bucket }) {
  const variant = bucket === 'auto' ? 'success' : bucket === 'waiting' ? 'warning' : 'secondary';
  return <Badge variant={variant} className="px-2.5 py-1 text-sm">{BUCKET_LABEL[bucket]}</Badge>;
}

export function ChannelLabel({ channel }: { channel: 'email' | 'chat' }) {
  return <span className="text-sm text-muted-foreground">{channel === 'email' ? '✉️ Email' : '💬 Chat'}</span>;
}
