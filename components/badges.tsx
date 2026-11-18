import { Mail, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { REASON_LABELS } from '@/lib/reason-labels';

export function ChannelBadge({ channel }: { channel: string | null }) {
  if (channel === 'email') return <Badge variant="secondary"><Mail className="size-3" aria-hidden /> Email</Badge>;
  if (channel === 'chat') return <Badge variant="secondary"><MessageCircle className="size-3" aria-hidden /> Chat</Badge>;
  return <Badge variant="outline">System</Badge>;
}

const CONV: Record<string, { label: string; variant: 'success' | 'destructive' | 'default' | 'secondary' }> = {
  auto_replied: { label: 'Auto-replied', variant: 'success' },
  escalated: { label: 'Escalated', variant: 'destructive' },
  open: { label: 'Open', variant: 'default' },
  resolved: { label: 'Resolved', variant: 'secondary' },
};
export function ConversationStatusBadge({ status }: { status: string }) {
  const s = CONV[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const ESC: Record<string, { label: string; variant: 'destructive' | 'warning' | 'secondary' }> = {
  open: { label: 'Open', variant: 'destructive' },
  in_progress: { label: 'In progress', variant: 'warning' },
  resolved: { label: 'Resolved', variant: 'secondary' },
};
export function EscalationStatusBadge({ status }: { status: string }) {
  const s = ESC[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const v = priority === 'high' ? 'destructive' : priority === 'low' ? 'secondary' : 'outline';
  return <Badge variant={v}>{priority}</Badge>;
}

export function ReasonBadge({ code }: { code: string | null }) {
  if (!code) return <span className="text-muted-foreground">—</span>;
  return <Badge variant="outline" title={code}>{REASON_LABELS[code] ?? code}</Badge>;
}

export function ConfidenceValue({ value, threshold }: { value: number | null; threshold?: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const below = threshold != null && value < threshold;
  return <span className={below ? 'font-medium text-destructive tabular-nums' : 'tabular-nums'}>{value.toFixed(2)}</span>;
}
