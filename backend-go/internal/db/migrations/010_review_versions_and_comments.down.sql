DROP TABLE IF EXISTS comment_contents;
ALTER TABLE manuscript_reviewers DROP CONSTRAINT IF EXISTS manuscript_reviewers_pkey;
ALTER TABLE manuscript_reviewers DROP COLUMN IF EXISTS version;
ALTER TABLE manuscript_reviewers ADD PRIMARY KEY (ms_id, reviewer_address);
ALTER TABLE reviews DROP COLUMN IF EXISTS version;
