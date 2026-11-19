-- 002: answers (FAQ) with full-text search, and the assistant's instructions with versions.

CREATE TABLE IF NOT EXISTS faq (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '',          -- keywords, comma-separated
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_faq_active ON faq (active);

CREATE VIRTUAL TABLE IF NOT EXISTS faq_fts USING fts5(
  question, answer, tags, content = 'faq', content_rowid = 'id', tokenize = 'porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS faq_ai AFTER INSERT ON faq BEGIN
  INSERT INTO faq_fts (rowid, question, answer, tags) VALUES (new.id, new.question, new.answer, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS faq_ad AFTER DELETE ON faq BEGIN
  INSERT INTO faq_fts (faq_fts, rowid, question, answer, tags) VALUES ('delete', old.id, old.question, old.answer, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS faq_au AFTER UPDATE ON faq BEGIN
  INSERT INTO faq_fts (faq_fts, rowid, question, answer, tags) VALUES ('delete', old.id, old.question, old.answer, old.tags);
  INSERT INTO faq_fts (rowid, question, answer, tags) VALUES (new.id, new.question, new.answer, new.tags);
END;
INSERT INTO faq_fts (faq_fts) VALUES ('rebuild');

-- claude_system | gemini_reviewer | holding_message | email_signature | chat_greeting
CREATE TABLE IF NOT EXISTS prompts (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  body       TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  prompt_id  TEXT NOT NULL,
  version    INTEGER NOT NULL,
  body       TEXT NOT NULL,
  changed_by TEXT,
  changed_at TEXT NOT NULL,
  note       TEXT,
  PRIMARY KEY (prompt_id, version)
);
