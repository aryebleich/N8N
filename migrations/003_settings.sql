-- 003: runtime settings read by the admin site and by the n8n workflow (30 s cache).
-- value_json holds any JSON value. Defaults are inserted once and never overwrite edits.

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES
  ('confidence_threshold',       '0.8',                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('confidence_threshold_email', 'null',                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('confidence_threshold_chat',  'null',                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('claude_model',               '"claude-sonnet-5-5"',     strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('gemini_model',               '"gemini-flash-latest"',   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('max_tokens',                 '1024',                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('request_timeout_ms',         '30000',                   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('auto_reply_email',           'true',                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('auto_reply_chat',            'true',                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('business_hours',             '{"enabled":false,"timezone":"America/New_York","outside_mode":"holding","days":{"mon":["09:00","17:00"],"tue":["09:00","17:00"],"wed":["09:00","17:00"],"thu":["09:00","17:00"],"fri":["09:00","17:00"],"sat":null,"sun":null}}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('blocked_senders',            '[]',                      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('blocked_keywords',           '[]',                      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('slack_channel_id',           '""',                      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('company_name',               '"Northwind Goods"',       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('support_from_email',         '""',                      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('sla_minutes',                '{"high":60,"normal":240,"low":1440}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('retention_days',             'null',                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('integration_oracle',         '{"base_url":"","user":"SUPPORT_RO"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('integration_imap',           '{"host":"","port":993,"secure":true,"user":""}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('integration_smtp',           '{"host":"","port":465,"secure":true,"user":""}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
