-- =====================================================================
-- Turso (libSQL) schema for the dual-LLM support workflow
-- Apply with:  turso db shell <db-name> < turso/schema.sql
-- Safe to re-run: every statement is IF NOT EXISTS.
-- All timestamps are ISO-8601 UTC strings (e.g. 2026-11-18T09:30:00.000Z),
-- which sort correctly as TEXT.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- One row per conversation (an email thread or a chat session).
--   id: "email:<root Message-ID>" or "chat:<uuid issued by the widget>"
CREATE TABLE IF NOT EXISTS conversations (
  id                 TEXT PRIMARY KEY,
  channel            TEXT NOT NULL CHECK (channel IN ('email', 'chat')),
  customer_email     TEXT,
  customer_name      TEXT,
  oracle_customer_id TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_email   ON conversations (customer_email);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations (updated_at);

-- Every customer message and every reply (automatic, holding or human).
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('customer', 'assistant', 'human')),
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);

-- Knowledge base used for retrieval. Edit rows here, not in the workflow.
--   tags: comma-separated keywords, e.g. "shipping,delivery,tracking"
CREATE TABLE IF NOT EXISTS faq (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_faq_active ON faq (active);

-- Every hand-off to a human, plus system errors from error-handler.json.
--   status: 'open' | 'resolved' | 'system_error'
CREATE TABLE IF NOT EXISTS escalations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id   TEXT,
  channel           TEXT,
  claude_confidence REAL,
  gemini_confidence REAL,
  reason            TEXT,
  gemini_issues     TEXT,          -- JSON array of strings
  claude_draft      TEXT,
  slack_ts          TEXT,
  status            TEXT NOT NULL DEFAULT 'open',
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_escalations_status       ON escalations (status, created_at);
CREATE INDEX IF NOT EXISTS idx_escalations_conversation ON escalations (conversation_id);

-- Session tokens written by YOUR website's login backend when a customer
-- signs in. The chat widget sends the token; the workflow only reads it.
CREATE TABLE IF NOT EXISTS session_tokens (
  token              TEXT PRIMARY KEY,
  customer_email     TEXT NOT NULL,
  oracle_customer_id TEXT,
  expires_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_tokens_expires ON session_tokens (expires_at);

-- ---------------------------------------------------------------------
-- Optional full-text search over the FAQ (FTS5, external-content table).
-- The workflow tries FTS5 first and falls back to LIKE matching in the
-- same pipeline request, so it works with or without this section.
-- ---------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS faq_fts USING fts5(
  question,
  answer,
  tags,
  content = 'faq',
  content_rowid = 'id',
  tokenize = 'porter unicode61'
);

-- Keep the FTS index in sync with the faq table.
CREATE TRIGGER IF NOT EXISTS faq_ai AFTER INSERT ON faq BEGIN
  INSERT INTO faq_fts (rowid, question, answer, tags)
  VALUES (new.id, new.question, new.answer, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS faq_ad AFTER DELETE ON faq BEGIN
  INSERT INTO faq_fts (faq_fts, rowid, question, answer, tags)
  VALUES ('delete', old.id, old.question, old.answer, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS faq_au AFTER UPDATE ON faq BEGIN
  INSERT INTO faq_fts (faq_fts, rowid, question, answer, tags)
  VALUES ('delete', old.id, old.question, old.answer, old.tags);
  INSERT INTO faq_fts (rowid, question, answer, tags)
  VALUES (new.id, new.question, new.answer, new.tags);
END;

-- Rebuild the index from existing rows (harmless on an empty table).
INSERT INTO faq_fts (faq_fts) VALUES ('rebuild');
