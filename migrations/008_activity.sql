-- 008: AI decisions, internal notes, the realtime event log and rate limits.

-- One row per message the n8n workflow processed: both model outputs and the decision.
CREATE TABLE IF NOT EXISTS ai_decisions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id        TEXT NOT NULL UNIQUE,  -- idempotency key from n8n (ctx.requestId)
  conversation_id   TEXT NOT NULL,
  message_id        INTEGER,               -- the customer message
  channel           TEXT NOT NULL,
  outcome           TEXT NOT NULL CHECK (outcome IN ('auto', 'escalated', 'failed')),
  reason            TEXT,
  reason_code       TEXT,
  claude_json       TEXT,
  gemini_json       TEXT,
  claude_confidence REAL,
  gemini_confidence REAL,
  both_valid        INTEGER NOT NULL DEFAULT 0,
  gemini_agrees     INTEGER NOT NULL DEFAULT 0,
  any_needs_human   INTEGER NOT NULL DEFAULT 1,
  force_human       INTEGER NOT NULL DEFAULT 0,
  threshold         REAL,
  account_json      TEXT,                  -- masked Oracle summary (verified customers only)
  meta_json         TEXT,                  -- identity, account_lookup, retrieval
  delivery_status   TEXT,                  -- sent | failed | not_applicable
  delivery_error    TEXT,
  response_ms       INTEGER,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_conversation ON ai_decisions (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_created ON ai_decisions (created_at);

CREATE TABLE IF NOT EXISTS conversation_notes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  author_id       TEXT NOT NULL,
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_conversation ON conversation_notes (conversation_id);

-- Realtime feed: the SSE endpoint streams rows with id > Last-Event-ID.
CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  type            TEXT NOT NULL,           -- message.created, conversation.updated, escalation.created, ...
  conversation_id TEXT,
  payload_json    TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,           -- e.g. login:ip:1.2.3.4
  window_start INTEGER NOT NULL,           -- unix ms
  count        INTEGER NOT NULL
);
