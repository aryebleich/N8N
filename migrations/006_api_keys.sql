-- 006: encrypted API keys (AES-256-GCM, key from ENCRYPTION_KEY) and integration health.

CREATE TABLE IF NOT EXISTS api_keys (
  name       TEXT PRIMARY KEY,     -- anthropic_api_key, google_ai_api_key, slack_bot_token, ...
  ciphertext TEXT NOT NULL,        -- base64
  iv         TEXT NOT NULL,        -- base64, 12 bytes
  tag        TEXT NOT NULL,        -- base64, 16 bytes
  last4      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS integration_status (
  service         TEXT PRIMARY KEY, -- turso, oracle, anthropic, google, slack, imap, smtp
  last_success_at TEXT,
  last_latency_ms INTEGER,
  last_error      TEXT,
  last_error_at   TEXT,
  last_checked_at TEXT
);
