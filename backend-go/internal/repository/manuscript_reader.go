package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type ManuscriptReader interface {
	ListManuscripts(ctx context.Context) ([]ManuscriptSummary, error)
	// ListManuscriptsPaged lists manuscripts, optionally filtered by status
	// (empty string = no filter). Backs both the Tracker (all statuses) and
	// the Explore hub (status=PUBLISHED) via the same endpoint.
	ListManuscriptsPaged(ctx context.Context, limit, offset int, status string) ([]ManuscriptSummary, error)
	CountManuscripts(ctx context.Context, status string) (int, error)
	GetManuscriptByID(ctx context.Context, msId uint64) (*ManuscriptDetail, error)
	GetOpenReview(ctx context.Context, msId uint64) (*OpenReview, error)
}

type OpenReviewEntry struct {
	ReviewerAddress string  `json:"reviewer_address"`
	Verdict         string  `json:"verdict"`
	ReviewCid       *string `json:"review_cid"`
	TxHash          string  `json:"tx_hash"`
}

type OpenReviewVersion struct {
	Version   int               `json:"version"`
	Date      *time.Time        `json:"date"`
	Reviewers []string          `json:"reviewers"`
	Reviews   []OpenReviewEntry `json:"reviews"`
}

type OpenReview struct {
	MsId          uint64              `json:"ms_id"`
	Status        string              `json:"status"`
	AuthorAddress string              `json:"author_address"`
	Versions      []OpenReviewVersion `json:"versions"`
	Reviewers     []string            `json:"reviewers"`
}

type ManuscriptSummary struct {
	MsId            uint64     `json:"ms_id"`
	CID             string     `json:"cid"`
	Metadata        string     `json:"metadata"`
	Status          string     `json:"status"`
	Version         int        `json:"version"`
	AuthorAddress   string     `json:"author_address"`
	PlagiarismScore *int       `json:"plagiarism_score"`
	SubmitTxHash    string     `json:"submit_tx_hash"`
	SubmitBlock     int64      `json:"submit_block"`
	SubmitTimestamp *time.Time `json:"submit_timestamp"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type ManuscriptReviewer struct {
	ReviewerAddress string    `json:"reviewer_address"`
	AssignedAt      time.Time `json:"assigned_at"`
}

type ManuscriptReview struct {
	ReviewerAddress string    `json:"reviewer_address"`
	Verdict         string    `json:"verdict"`
	ReviewCid       *string   `json:"review_cid,omitempty"`
	TxHash          string    `json:"tx_hash"`
	BlockNumber     int64     `json:"block_number"`
	SubmittedAt     time.Time `json:"submitted_at"`
}

type ManuscriptRevision struct {
	NewCID      string    `json:"new_cid"`
	Version     int       `json:"version"`
	TxHash      string    `json:"tx_hash"`
	BlockNumber int64     `json:"block_number"`
	RevisedAt   time.Time `json:"revised_at"`
}

type PlagiarismRequest struct {
	RequestID   uint64     `json:"request_id"`
	Score       *int       `json:"score"`
	Fulfilled   bool       `json:"fulfilled"`
	RequestedAt time.Time  `json:"requested_at"`
	FulfilledAt *time.Time `json:"fulfilled_at"`
}

type ProcessedEvent struct {
	EventName    string    `json:"event_name"`
	TxHash       string    `json:"tx_hash"`
	BlockNumber  uint64    `json:"block_number"`
	LogIndex     uint      `json:"log_index"`
	ContractAddr string    `json:"contract_addr"`
	ProcessedAt  time.Time `json:"processed_at"`
}

type ManuscriptDetail struct {
	ManuscriptSummary
	Metadata        string               `json:"metadata"`
	Field           *string              `json:"field"`
	DOI             *string              `json:"doi"`
	DOITokenID      *int64               `json:"doi_token_id"`
	AcceptCount     int                  `json:"accept_count"`
	RejectCount     int                  `json:"reject_count"`
	ReviseCount     int                  `json:"revise_count"`
	Reviewers       []ManuscriptReviewer `json:"reviewers"`
	Reviews         []ManuscriptReview   `json:"reviews"`
	Revisions       []ManuscriptRevision `json:"revisions"`
	PlagiarismReqs  []PlagiarismRequest  `json:"plagiarism_requests"`
	Events          []ProcessedEvent     `json:"events"`
}

type PostgresManuscriptReader struct {
	db *sql.DB
}

func NewPostgresManuscriptReader(db *sql.DB) *PostgresManuscriptReader {
	return &PostgresManuscriptReader{db: db}
}

func (r *PostgresManuscriptReader) ListManuscripts(ctx context.Context) ([]ManuscriptSummary, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT ms_id, COALESCE(cid,''), COALESCE(metadata,''), COALESCE(status,''), version,
		       COALESCE(author_address,''), plagiarism_score,
		       COALESCE(submit_tx_hash,''), COALESCE(submit_block,0),
		       submit_timestamp, created_at, updated_at
		FROM manuscripts ORDER BY ms_id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ManuscriptSummary
	for rows.Next() {
		var ms ManuscriptSummary
		if err := rows.Scan(
			&ms.MsId, &ms.CID, &ms.Metadata, &ms.Status, &ms.Version,
			&ms.AuthorAddress, &ms.PlagiarismScore,
			&ms.SubmitTxHash, &ms.SubmitBlock,
			&ms.SubmitTimestamp, &ms.CreatedAt, &ms.UpdatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, ms)
	}
	if result == nil {
		result = []ManuscriptSummary{}
	}
	return result, rows.Err()
}

func (r *PostgresManuscriptReader) ListManuscriptsPaged(ctx context.Context, limit, offset int, status string) ([]ManuscriptSummary, error) {
	query := `
		SELECT ms_id, COALESCE(cid,''), COALESCE(metadata,''), COALESCE(status,''), version,
		       COALESCE(author_address,''), plagiarism_score,
		       COALESCE(submit_tx_hash,''), COALESCE(submit_block,0),
		       submit_timestamp, created_at, updated_at
		FROM manuscripts`
	args := []any{limit, offset}
	if status != "" {
		query += ` WHERE status = $3`
		args = append(args, status)
	}
	query += ` ORDER BY ms_id DESC LIMIT $1 OFFSET $2`
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ManuscriptSummary
	for rows.Next() {
		var ms ManuscriptSummary
		if err := rows.Scan(
			&ms.MsId, &ms.CID, &ms.Metadata, &ms.Status, &ms.Version,
			&ms.AuthorAddress, &ms.PlagiarismScore,
			&ms.SubmitTxHash, &ms.SubmitBlock,
			&ms.SubmitTimestamp, &ms.CreatedAt, &ms.UpdatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, ms)
	}
	if result == nil {
		result = []ManuscriptSummary{}
	}
	return result, rows.Err()
}

func (r *PostgresManuscriptReader) CountManuscripts(ctx context.Context, status string) (int, error) {
	query := `SELECT count(*) FROM manuscripts`
	args := []any{}
	if status != "" {
		query += ` WHERE status = $1`
		args = append(args, status)
	}
	var n int
	err := r.db.QueryRowContext(ctx, query, args...).Scan(&n)
	return n, err
}

// GetOpenReview builds the per-version reviewer reports from the indexed
// (version-tagged) manuscript_reviewers and reviews rows.
func (r *PostgresManuscriptReader) GetOpenReview(ctx context.Context, msId uint64) (*OpenReview, error) {
	var maxVersion int
	var status, authorAddr string
	var submitTs *time.Time
	var createdAt time.Time
	err := r.db.QueryRowContext(ctx,
		`SELECT version, COALESCE(status,''), COALESCE(author_address,''), submit_timestamp, created_at FROM manuscripts WHERE ms_id = $1`, msId,
	).Scan(&maxVersion, &status, &authorAddr, &submitTs, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	revDates := map[int]*time.Time{}
	rrows, err := r.db.QueryContext(ctx,
		`SELECT version, revised_at FROM manuscript_revisions WHERE ms_id = $1`, msId)
	if err != nil {
		return nil, err
	}
	for rrows.Next() {
		var v int
		var t time.Time
		if err := rrows.Scan(&v, &t); err != nil {
			rrows.Close()
			return nil, err
		}
		tt := t
		revDates[v] = &tt
	}
	rrows.Close()

	out := &OpenReview{MsId: msId, Status: status, AuthorAddress: authorAddr, Versions: []OpenReviewVersion{}}
	seenReviewer := map[string]bool{}

	for v := 1; v <= maxVersion; v++ {
		ver := OpenReviewVersion{Version: v, Reviewers: []string{}, Reviews: []OpenReviewEntry{}}
		if v == 1 {
			if submitTs != nil {
				ver.Date = submitTs
			} else {
				d := createdAt
				ver.Date = &d
			}
		} else {
			ver.Date = revDates[v]
		}

		vr, err := r.db.QueryContext(ctx,
			`SELECT reviewer_address FROM manuscript_reviewers WHERE ms_id = $1 AND version = $2 ORDER BY reviewer_address`, msId, v)
		if err != nil {
			return nil, err
		}
		for vr.Next() {
			var addr string
			if err := vr.Scan(&addr); err != nil {
				vr.Close()
				return nil, err
			}
			ver.Reviewers = append(ver.Reviewers, addr)
			if !seenReviewer[addr] {
				seenReviewer[addr] = true
				out.Reviewers = append(out.Reviewers, addr)
			}
		}
		vr.Close()

		er, err := r.db.QueryContext(ctx,
			`SELECT reviewer_address, verdict, review_cid, COALESCE(tx_hash,'')
			 FROM reviews WHERE ms_id = $1 AND version = $2`, msId, v)
		if err != nil {
			return nil, err
		}
		for er.Next() {
			var e OpenReviewEntry
			if err := er.Scan(&e.ReviewerAddress, &e.Verdict, &e.ReviewCid, &e.TxHash); err != nil {
				er.Close()
				return nil, err
			}
			ver.Reviews = append(ver.Reviews, e)
		}
		er.Close()

		out.Versions = append(out.Versions, ver)
	}
	return out, nil
}

func (r *PostgresManuscriptReader) GetManuscriptByID(ctx context.Context, msId uint64) (*ManuscriptDetail, error) {
	var d ManuscriptDetail

	err := r.db.QueryRowContext(ctx, `
		SELECT ms_id, COALESCE(cid,''), COALESCE(metadata,''), COALESCE(status,''), version,
		       COALESCE(author_address,''), plagiarism_score, field, doi, doi_token_id,
		       accept_count, reject_count, revise_count,
		       COALESCE(submit_tx_hash,''), COALESCE(submit_block,0),
		       submit_timestamp, created_at, updated_at
		FROM manuscripts WHERE ms_id = $1
	`, msId).Scan(
		&d.MsId, &d.CID, &d.Metadata, &d.Status, &d.Version,
		&d.AuthorAddress, &d.PlagiarismScore, &d.Field, &d.DOI, &d.DOITokenID,
		&d.AcceptCount, &d.RejectCount, &d.ReviseCount,
		&d.SubmitTxHash, &d.SubmitBlock,
		&d.SubmitTimestamp, &d.CreatedAt, &d.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	// Reviewers
	rows, err := r.db.QueryContext(ctx, `
		SELECT reviewer_address, assigned_at
		FROM manuscript_reviewers WHERE ms_id = $1 ORDER BY assigned_at
	`, msId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var rv ManuscriptReviewer
		if err := rows.Scan(&rv.ReviewerAddress, &rv.AssignedAt); err != nil {
			return nil, err
		}
		d.Reviewers = append(d.Reviewers, rv)
	}
	if d.Reviewers == nil {
		d.Reviewers = []ManuscriptReviewer{}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Reviews
	rrows, err := r.db.QueryContext(ctx, `
		SELECT reviewer_address, verdict, review_cid,
		       COALESCE(tx_hash,''), COALESCE(block_number,0), submitted_at
		FROM reviews WHERE ms_id = $1 ORDER BY block_number
	`, msId)
	if err != nil {
		return nil, err
	}
	defer rrows.Close()
	for rrows.Next() {
		var rv ManuscriptReview
		if err := rrows.Scan(&rv.ReviewerAddress, &rv.Verdict, &rv.ReviewCid, &rv.TxHash, &rv.BlockNumber, &rv.SubmittedAt); err != nil {
			return nil, err
		}
		d.Reviews = append(d.Reviews, rv)
	}
	if d.Reviews == nil {
		d.Reviews = []ManuscriptReview{}
	}
	if err := rrows.Err(); err != nil {
		return nil, err
	}

	// Revisions
	vrows, err := r.db.QueryContext(ctx, `
		SELECT new_cid, version,
		       COALESCE(tx_hash,''), COALESCE(block_number,0), revised_at
		FROM manuscript_revisions WHERE ms_id = $1 ORDER BY version
	`, msId)
	if err != nil {
		return nil, err
	}
	defer vrows.Close()
	for vrows.Next() {
		var rev ManuscriptRevision
		if err := vrows.Scan(&rev.NewCID, &rev.Version, &rev.TxHash, &rev.BlockNumber, &rev.RevisedAt); err != nil {
			return nil, err
		}
		d.Revisions = append(d.Revisions, rev)
	}
	if d.Revisions == nil {
		d.Revisions = []ManuscriptRevision{}
	}
	if err := vrows.Err(); err != nil {
		return nil, err
	}

	// Plagiarism requests
	prows, err := r.db.QueryContext(ctx, `
		SELECT request_id, score, fulfilled, requested_at, fulfilled_at
		FROM plagiarism_requests WHERE ms_id = $1 ORDER BY request_id
	`, msId)
	if err != nil {
		return nil, err
	}
	defer prows.Close()
	for prows.Next() {
		var pr PlagiarismRequest
		if err := prows.Scan(&pr.RequestID, &pr.Score, &pr.Fulfilled, &pr.RequestedAt, &pr.FulfilledAt); err != nil {
			return nil, err
		}
		d.PlagiarismReqs = append(d.PlagiarismReqs, pr)
	}
	if d.PlagiarismReqs == nil {
		d.PlagiarismReqs = []PlagiarismRequest{}
	}
	if err := prows.Err(); err != nil {
		return nil, err
	}

	// Processed events (on-chain audit log, linked via ms_id)
	erows, err := r.db.QueryContext(ctx, `
		SELECT event_name, COALESCE(tx_hash,''), block_number, log_index, contract_addr, processed_at
		FROM processed_events
		WHERE ms_id = $1
		ORDER BY block_number, log_index
	`, msId)
	if err != nil {
		return nil, err
	}
	defer erows.Close()
	for erows.Next() {
		var pe ProcessedEvent
		if err := erows.Scan(&pe.EventName, &pe.TxHash, &pe.BlockNumber, &pe.LogIndex, &pe.ContractAddr, &pe.ProcessedAt); err != nil {
			return nil, err
		}
		d.Events = append(d.Events, pe)
	}
	if d.Events == nil {
		d.Events = []ProcessedEvent{}
	}
	if err := erows.Err(); err != nil {
		return nil, err
	}

	return &d, nil
}
