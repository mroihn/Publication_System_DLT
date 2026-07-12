ALTER TABLE reviews ADD COLUMN IF NOT EXISTS version INTEGER;
ALTER TABLE manuscript_reviewers ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE manuscript_reviewers DROP CONSTRAINT IF EXISTS manuscript_reviewers_pkey;
ALTER TABLE manuscript_reviewers ADD PRIMARY KEY (ms_id, reviewer_address, version);

UPDATE reviews rv
SET version = 1 + (
    SELECT count(*) FROM manuscript_revisions r
    WHERE r.ms_id = rv.ms_id AND r.block_number <= rv.block_number
)
WHERE version IS NULL;

CREATE TABLE IF NOT EXISTS comment_contents (
    content_hash CHAR(66)    PRIMARY KEY,
    doi_token_id BIGINT      NOT NULL,
    cid          TEXT,
    body         TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
