-- The backend no longer maintains an off-chain mirror of on-chain state (the
-- Indexer subsystem). Reads that used to hit these tables now call the
-- deployed contracts directly. comment_contents is NOT dropped: it holds
-- comment body text that never existed on-chain (only its hash does).
DROP TABLE IF EXISTS doi_comments;
DROP TABLE IF EXISTS plagiarism_requests;
DROP TABLE IF EXISTS manuscript_revisions;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS manuscript_reviewers;
DROP TABLE IF EXISTS processed_events;
DROP TABLE IF EXISTS indexer_checkpoints;
DROP TABLE IF EXISTS incentive_payments;
DROP TABLE IF EXISTS manuscripts;
