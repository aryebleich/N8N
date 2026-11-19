-- 001: settings and the audit log.
-- Safe to run more than once. The app applies migrations automatically on start.

-- Every setting the panel and the n8n workflow read. value_json holds any JSON value.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

-- Every change made in the panel or by n8n. Append-only: edits and deletes are rejected.
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT,            -- 'admin' (the panel), 'n8n' or 'system'
  actor_email TEXT,
  action      TEXT NOT NULL,   -- e.g. faq.update, settings.update, prompt.restore
  entity      TEXT NOT NULL,   -- faq, settings, prompt, conversation, ...
  entity_id   TEXT,
  old_json    TEXT,
  new_json    TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log (entity, entity_id);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
