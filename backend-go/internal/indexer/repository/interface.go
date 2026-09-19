package repository

import (
	"context"
	"database/sql"
	"time"
)

type IndexerRepository interface {
	// MarkProcessed inserts the (txHash, logIndex) pair inside the provided tx.
	// Returns true if the event was already processed (idempotency guard).
	// msId is optional — pass nil for events that are not manuscript-scoped.
	MarkProcessed(ctx context.Context, tx *sql.Tx, txHash string, logIndex uint, blockNumber uint64, eventName, contractAddr string, msId *uint64) (bool, error)

	GetLastBlock(ctx context.Context, contractKey string) (uint64, error)
	SaveLastBlock(ctx context.Context, tx *sql.Tx, contractKey string, block uint64) error

	UpsertManuscript(ctx context.Context, tx *sql.Tx, ms ManuscriptRow) error
	GetManuscriptVersion(ctx context.Context, tx *sql.Tx, msId uint64) (uint64, error)
	UpdateManuscriptStatus(ctx context.Context, tx *sql.Tx, msId uint64, status string) error
	UpdateManuscriptCID(ctx context.Context, tx *sql.Tx, msId uint64, newCid string, version uint64) error
	UpdateManuscriptDOI(ctx context.Context, tx *sql.Tx, msId uint64, doi string, doiTokenId uint64) error
	UpdateManuscriptField(ctx context.Context, tx *sql.Tx, msId uint64, field string) error
	AssignEditor(ctx context.Context, tx *sql.Tx, msId uint64) error
	IncrementVerdictCount(ctx context.Context, tx *sql.Tx, msId uint64, verdict string) error
	SetReviewers(ctx context.Context, tx *sql.Tx, msId uint64, reviewers []string, version uint64) error
	InsertReview(ctx context.Context, tx *sql.Tx, review ReviewRow) error
	InsertPlagiarismRequest(ctx context.Context, tx *sql.Tx, requestId, msId uint64, cid string) error
	FulfillPlagiarismRequest(ctx context.Context, tx *sql.Tx, requestId, msId, score uint64) error
	InsertComment(ctx context.Context, tx *sql.Tx, comment CommentRow) error
	InsertIncentivePayment(ctx context.Context, tx *sql.Tx, payment IncentiveRow) error
	InsertRevision(ctx context.Context, tx *sql.Tx, revision RevisionRow) error
}

type ManuscriptRow struct {
	MsId          uint64
	AuthorAddress string
	CID           string
	Metadata      string
	Status        string
	Version       uint64
	TxHash        string
	BlockNumber   uint64
	SubmittedAt   *time.Time // on-chain block timestamp; nil for pre-fix historical events
	JournalID     *int64     // author's chosen journal, parsed from the signed metadata; nil if absent
}

type ReviewRow struct {
	MsId            uint64
	ReviewerAddress string
	Verdict         string
	ReviewCid       string
	TxHash          string
	BlockNumber     uint64
	Version         uint64
}

type CommentRow struct {
	DoiTokenId       uint64
	CommenterAddress string
	ContentHash      string
	TxHash           string
	BlockNumber      uint64
}

type IncentiveRow struct {
	ReviewerAddress string
	AmountWei       string // big.Int.String()
	TxHash          string
	BlockNumber     uint64
}

type RevisionRow struct {
	MsId        uint64
	NewCid      string
	Version     uint64
	TxHash      string
	BlockNumber uint64
}
