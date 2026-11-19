-- 003: conversations, messages, escalations and chat session tokens (shared with n8n).
-- migrate:statement-by-statement
-- Runs one statement at a time and ignores "duplicate column name", so the ALTERs below
-- add missing columns to databases created by n8n/turso/schema.sql or older versions.

CREATE TABLE IF NOT EXISTS conversations (
  id                 TEXT PRIMARY KEY,   -- "email:<root Message-ID>" or "chat:<uuid>"
  channel            TEXT NOT NULL CHECK (channel IN ('email', 'chat')),
  customer_email     TEXT,
  customer_name      TEXT,
  oracle_customer_id TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'open',  -- auto_replied | escalated | open | resolved
  last_message_at    TEXT,
  email_thread_json  TEXT
);
ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE conversations ADD COLUMN last_message_at TEXT;
ALTER TABLE conversations ADD COLUMN email_thread_json TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_email ON conversations (customer_email);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('customer', 'assistant', 'human')),
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  author_id       TEXT,
  meta_json       TEXT,                 -- for AI replies: both model outputs and the decision
  request_id      TEXT                  -- n8n idempotency key on the customer message
);
ALTER TABLE messages ADD COLUMN author_id TEXT;
ALTER TABLE messages ADD COLUMN meta_json TEXT;
ALTER TABLE messages ADD COLUMN request_id TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_request ON messages (request_id) WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS escalations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id   TEXT,
  channel           TEXT,
  claude_confidence REAL,
  gemini_confidence REAL,
  reason            TEXT,
  gemini_issues     TEXT,
  claude_draft      TEXT,
  slack_ts          TEXT,
  status            TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | resolved
  created_at        TEXT NOT NULL,
  priority          TEXT NOT NULL DEFAULT 'normal',
  reason_code       TEXT,
  sla_due_at        TEXT,
  resolved_at       TEXT,
  updated_at        TEXT
);
ALTER TABLE escalations ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE escalations ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE escalations ADD COLUMN reason_code TEXT;
ALTER TABLE escalations ADD COLUMN sla_due_at TEXT;
ALTER TABLE escalations ADD COLUMN resolved_at TEXT;
ALTER TABLE escalations ADD COLUMN updated_at TEXT;
CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations (status, created_at);
CREATE INDEX IF NOT EXISTS idx_escalations_conversation ON escalations (conversation_id);

-- Written by your website's login; read by n8n to verify signed-in chat customers.
CREATE TABLE IF NOT EXISTS session_tokens (
  token              TEXT PRIMARY KEY,
  customer_email     TEXT NOT NULL,
  oracle_customer_id TEXT,
  expires_at         TEXT NOT NULL
);
