ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_provider VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_subject VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_email VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS users_identity_key ON users (identity_provider, identity_subject);
