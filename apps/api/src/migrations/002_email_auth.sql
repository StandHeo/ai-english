-- Email as primary login identifier; phone optional for legacy SMS rows.
PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  created_at TEXT NOT NULL,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

INSERT INTO users_new (id, email, phone, created_at)
SELECT id, NULL, phone, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE TABLE IF NOT EXISTS auth_codes (
  channel TEXT NOT NULL,
  destination TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (channel, destination)
);

INSERT INTO auth_codes (channel, destination, code_hash, expires_at, attempts, sent_at)
SELECT 'sms', phone, code_hash, expires_at, attempts, sent_at FROM sms_codes;

DROP TABLE sms_codes;

PRAGMA foreign_keys = ON;
