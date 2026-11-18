-- 005: append-only audit log. UPDATE and DELETE are rejected by triggers.

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   TEXT,                 -- users.id, or 'system' / 'n8n'
  actor_email TEXT,
  action     TEXT NOT NULL,        -- e.g. faq.update, settings.update, user.invite
  entity     TEXT NOT NULL,        -- e.g. faq, settings, prompt, user, conversation
  entity_id  TEXT,
  old_json   TEXT,
  new_json   TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_log (actor_id);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
