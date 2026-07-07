-- Editor role + reviewer specialization verification.

-- Reviewer's editor-verified subject fields (mirror of on-chain verifiedReviewerFields).
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_fields TEXT[] NOT NULL DEFAULT '{}';

-- Subject field an editor assigned to a manuscript (mirror of on-chain, set by the indexer).
ALTER TABLE manuscripts ADD COLUMN IF NOT EXISTS field TEXT;

-- Reviewer specialization verification queue (off-chain approval flow).
CREATE TABLE IF NOT EXISTS reviewer_field_requests (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    UUID        NOT NULL,
    fields     TEXT[]      NOT NULL DEFAULT '{}',
    status     VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
    decided_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviewer_field_requests_status ON reviewer_field_requests(status);
CREATE INDEX IF NOT EXISTS idx_reviewer_field_requests_user   ON reviewer_field_requests(user_id);

-- Seed a demo editor account (email: editor@desci.local, password: editor123).
-- Editors are hardcoded, not self-registered.
INSERT INTO users (id, email, password_hash, role, updated_at)
VALUES (
    gen_random_uuid(),
    'editor@desci.local',
    '$2a$10$Hj.vvyBv/bFrlvQ3P/N/Ne.Qej7XGIHur87h5IhMY/QIU3YXBA17G',
    'editor',
    NOW()
)
ON CONFLICT (email) DO NOTHING;
