-- Account role and reviewer specialities chosen at registration.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role         VARCHAR(16) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS specialities TEXT[]      NOT NULL DEFAULT '{}';
