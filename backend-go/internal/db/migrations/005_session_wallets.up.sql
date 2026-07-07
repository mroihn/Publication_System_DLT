-- Off-chain identity mapping for double-blind peer review (Session Wallets).

-- Author's burner SubmissionWallet. Only the public address is stored here;
-- the private key stays in the author's browser (localStorage).
CREATE TABLE IF NOT EXISTS submission_wallets (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID        NOT NULL,
    address       CHAR(42)    NOT NULL UNIQUE,
    ms_id         BIGINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_submission_wallets_user ON submission_wallets(user_id);

-- Reviewer's burner session wallet, one per (manuscript, reviewer). The backend
-- holds custody of the private key so the reviewer can fetch it after logging in.
CREATE TABLE IF NOT EXISTS reviewer_sessions (
    id              BIGSERIAL   PRIMARY KEY,
    ms_id           BIGINT      NOT NULL,
    user_id         UUID,
    main_address    CHAR(42)    NOT NULL,
    session_address CHAR(42)    NOT NULL UNIQUE,
    session_privkey TEXT        NOT NULL,
    tier            VARCHAR(8),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ms_id, main_address)
);
CREATE INDEX IF NOT EXISTS idx_reviewer_sessions_user ON reviewer_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_reviewer_sessions_ms   ON reviewer_sessions(ms_id);
