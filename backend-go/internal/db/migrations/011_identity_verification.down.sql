DROP INDEX IF EXISTS users_identity_key;
ALTER TABLE users DROP COLUMN IF EXISTS identity_email;
ALTER TABLE users DROP COLUMN IF EXISTS identity_subject;
ALTER TABLE users DROP COLUMN IF EXISTS identity_provider;
