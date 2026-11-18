-- 007: extra columns on the shared support tables.
-- migrate:statement-by-statement  (duplicate-column errors are ignored, so this is re-runnable
-- and works whether or not a column such as escalations.status already exists)

ALTER TABLE escalations ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE escalations ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE escalations ADD COLUMN assignee_id TEXT;
ALTER TABLE escalations ADD COLUMN sla_due_at TEXT;
ALTER TABLE escalations ADD COLUMN reason_code TEXT;
ALTER TABLE escalations ADD COLUMN resolved_at TEXT;
ALTER TABLE escalations ADD COLUMN resolved_by TEXT;
ALTER TABLE escalations ADD COLUMN updated_at TEXT;
CREATE INDEX IF NOT EXISTS idx_escalations_assignee ON escalations (assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_escalations_reason ON escalations (reason_code);

ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE conversations ADD COLUMN assignee_id TEXT;
ALTER TABLE conversations ADD COLUMN last_message_at TEXT;
ALTER TABLE conversations ADD COLUMN email_thread_json TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations (status, updated_at);

ALTER TABLE messages ADD COLUMN author_id TEXT;
ALTER TABLE messages ADD COLUMN meta_json TEXT;
