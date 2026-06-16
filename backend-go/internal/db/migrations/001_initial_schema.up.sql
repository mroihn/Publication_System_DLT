CREATE TABLE IF NOT EXISTS users (
    id             UUID         PRIMARY KEY,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  TEXT         NOT NULL,
    wallet_address VARCHAR(42),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indexer_checkpoints (
    contract_key   VARCHAR(64)  PRIMARY KEY,
    last_block     BIGINT       NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_events (
    id            BIGSERIAL    PRIMARY KEY,
    tx_hash       CHAR(66)     NOT NULL,
    log_index     INTEGER      NOT NULL,
    block_number  BIGINT       NOT NULL,
    event_name    VARCHAR(64)  NOT NULL,
    contract_addr CHAR(42)     NOT NULL,
    processed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS manuscripts (
    ms_id            BIGINT       PRIMARY KEY,
    author_address   CHAR(42),
    cid              TEXT         NOT NULL,
    metadata         TEXT,
    status           VARCHAR(32)  NOT NULL DEFAULT 'SUBMITTED',
    version          INTEGER      NOT NULL DEFAULT 1,
    plagiarism_score INTEGER,
    doi              TEXT,
    doi_token_id     BIGINT,
    accept_count     INTEGER      NOT NULL DEFAULT 0,
    reject_count     INTEGER      NOT NULL DEFAULT 0,
    revise_count     INTEGER      NOT NULL DEFAULT 0,
    submit_tx_hash   CHAR(66),
    submit_block     BIGINT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manuscript_reviewers (
    ms_id            BIGINT      NOT NULL REFERENCES manuscripts(ms_id),
    reviewer_address CHAR(42)    NOT NULL,
    assigned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ms_id, reviewer_address)
);

CREATE TABLE IF NOT EXISTS reviews (
    id               BIGSERIAL   PRIMARY KEY,
    ms_id            BIGINT      NOT NULL REFERENCES manuscripts(ms_id),
    reviewer_address CHAR(42)    NOT NULL,
    verdict          VARCHAR(16) NOT NULL,
    tx_hash          CHAR(66),
    block_number     BIGINT,
    submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manuscript_revisions (
    id           BIGSERIAL   PRIMARY KEY,
    ms_id        BIGINT      NOT NULL REFERENCES manuscripts(ms_id),
    new_cid      TEXT        NOT NULL,
    version      INTEGER     NOT NULL,
    tx_hash      CHAR(66),
    block_number BIGINT,
    revised_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plagiarism_requests (
    request_id   BIGINT      PRIMARY KEY,
    ms_id        BIGINT      NOT NULL,
    cid          TEXT        NOT NULL,
    score        INTEGER,
    fulfilled    BOOLEAN     NOT NULL DEFAULT FALSE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fulfilled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS doi_comments (
    id                BIGSERIAL   PRIMARY KEY,
    doi_token_id      BIGINT      NOT NULL,
    commenter_address CHAR(42)    NOT NULL,
    content_hash      CHAR(66)    NOT NULL,
    tx_hash           CHAR(66),
    block_number      BIGINT,
    posted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incentive_payments (
    id               BIGSERIAL   PRIMARY KEY,
    reviewer_address CHAR(42)    NOT NULL,
    amount_wei       NUMERIC(78) NOT NULL,
    tx_hash          CHAR(66),
    block_number     BIGINT,
    paid_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manuscripts_status    ON manuscripts(status);
CREATE INDEX IF NOT EXISTS idx_manuscripts_author    ON manuscripts(author_address);
CREATE INDEX IF NOT EXISTS idx_reviews_ms_id         ON reviews(ms_id);
CREATE INDEX IF NOT EXISTS idx_processed_events_blk  ON processed_events(block_number);
CREATE INDEX IF NOT EXISTS idx_plagiarism_ms_id      ON plagiarism_requests(ms_id);
CREATE INDEX IF NOT EXISTS idx_doi_comments_token    ON doi_comments(doi_token_id);
