package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

type PostgresIndexerRepository struct {
	db *sql.DB
}

func NewPostgresIndexerRepository(db *sql.DB) *PostgresIndexerRepository {
	return &PostgresIndexerRepository{db: db}
}

func (r *PostgresIndexerRepository) MarkProcessed(ctx context.Context, tx *sql.Tx, txHash string, logIndex uint, blockNumber uint64, eventName, contractAddr string, msId *uint64) (bool, error) {
	result, err := tx.ExecContext(ctx,
		`INSERT INTO processed_events (tx_hash, log_index, block_number, event_name, contract_addr, ms_id)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (tx_hash, log_index) DO NOTHING`,
		txHash, logIndex, blockNumber, eventName, contractAddr, msId,
	)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	// rows == 0 means the row already existed → already processed.
	return rows == 0, nil
}

func (r *PostgresIndexerRepository) GetLastBlock(ctx context.Context, contractKey string) (uint64, error) {
	var block uint64
	err := r.db.QueryRowContext(ctx,
		`SELECT last_block FROM indexer_checkpoints WHERE contract_key = $1`, contractKey,
	).Scan(&block)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return block, err
}

func (r *PostgresIndexerRepository) SaveLastBlock(ctx context.Context, tx *sql.Tx, contractKey string, block uint64) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO indexer_checkpoints (contract_key, last_block, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (contract_key) DO UPDATE SET last_block = GREATEST(indexer_checkpoints.last_block, EXCLUDED.last_block), updated_at = NOW()`,
		contractKey, block,
	)
	return err
}

func (r *PostgresIndexerRepository) UpsertManuscript(ctx context.Context, tx *sql.Tx, ms ManuscriptRow) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO manuscripts (ms_id, author_address, cid, metadata, status, version, submit_tx_hash, submit_block, submit_timestamp, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		 ON CONFLICT (ms_id) DO NOTHING`,
		ms.MsId, ms.AuthorAddress, ms.CID, ms.Metadata, ms.Status, ms.Version, ms.TxHash, ms.BlockNumber, ms.SubmittedAt,
	)
	return err
}

func (r *PostgresIndexerRepository) GetManuscriptVersion(ctx context.Context, tx *sql.Tx, msId uint64) (uint64, error) {
	var version uint64
	err := tx.QueryRowContext(ctx, `SELECT COALESCE(version, 1) FROM manuscripts WHERE ms_id = $1`, msId).Scan(&version)
	if err == sql.ErrNoRows {
		return 1, nil
	}
	if err != nil {
		return 0, err
	}
	if version == 0 {
		version = 1
	}
	return version, nil
}

func (r *PostgresIndexerRepository) UpdateManuscriptStatus(ctx context.Context, tx *sql.Tx, msId uint64, status string) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE manuscripts SET status = $1, updated_at = NOW() WHERE ms_id = $2`,
		status, msId,
	)
	return err
}

func (r *PostgresIndexerRepository) UpdateManuscriptCID(ctx context.Context, tx *sql.Tx, msId uint64, newCid string, version uint64) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE manuscripts SET cid = $1, version = $2, status = 'CHECKING', updated_at = NOW() WHERE ms_id = $3`,
		newCid, version, msId,
	)
	return err
}

func (r *PostgresIndexerRepository) UpdateManuscriptDOI(ctx context.Context, tx *sql.Tx, msId uint64, doi string, doiTokenId uint64) error {
	// COALESCE(NULLIF($1,''), doi) preserves an already-set doi when called with an
	// empty string (DOIMinted carries only the token id; DOIRegistered carries the doi).
	// This makes the update independent of the order the two events are processed.
	_, err := tx.ExecContext(ctx,
		`UPDATE manuscripts SET doi = COALESCE(NULLIF($1, ''), doi), doi_token_id = $2, updated_at = NOW() WHERE ms_id = $3`,
		doi, doiTokenId, msId,
	)
	return err
}

func (r *PostgresIndexerRepository) UpdateManuscriptField(ctx context.Context, tx *sql.Tx, msId uint64, field string) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE manuscripts SET field = $1, updated_at = NOW() WHERE ms_id = $2`,
		field, msId,
	)
	return err
}

func (r *PostgresIndexerRepository) IncrementVerdictCount(ctx context.Context, tx *sql.Tx, msId uint64, verdict string) error {
	col := ""
	switch verdict {
	case "ACCEPT":
		col = "accept_count"
	case "REJECT":
		col = "reject_count"
	case "REVISE":
		col = "revise_count"
	default:
		return fmt.Errorf("unknown verdict: %s", verdict)
	}
	_, err := tx.ExecContext(ctx,
		fmt.Sprintf(`UPDATE manuscripts SET %s = %s + 1, updated_at = NOW() WHERE ms_id = $1`, col, col),
		msId,
	)
	return err
}

func (r *PostgresIndexerRepository) SetReviewers(ctx context.Context, tx *sql.Tx, msId uint64, reviewers []string, version uint64) error {
	// Replace only this version's assignments so earlier versions stay for the audit trail.
	if _, err := tx.ExecContext(ctx, `DELETE FROM manuscript_reviewers WHERE ms_id = $1 AND version = $2`, msId, version); err != nil {
		return err
	}
	if len(reviewers) == 0 {
		return nil
	}
	vals := make([]string, 0, len(reviewers))
	args := make([]any, 0, len(reviewers)*3)
	for i, addr := range reviewers {
		vals = append(vals, fmt.Sprintf("($%d, $%d, $%d)", i*3+1, i*3+2, i*3+3))
		args = append(args, msId, strings.ToLower(addr), version)
	}
	_, err := tx.ExecContext(ctx,
		fmt.Sprintf(`INSERT INTO manuscript_reviewers (ms_id, reviewer_address, version) VALUES %s ON CONFLICT DO NOTHING`, strings.Join(vals, ",")),
		args...,
	)
	return err
}

func (r *PostgresIndexerRepository) InsertReview(ctx context.Context, tx *sql.Tx, review ReviewRow) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO reviews (ms_id, reviewer_address, verdict, review_cid, tx_hash, block_number, version)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT DO NOTHING`,
		review.MsId, strings.ToLower(review.ReviewerAddress), review.Verdict, review.ReviewCid, review.TxHash, review.BlockNumber, review.Version,
	)
	return err
}

func (r *PostgresIndexerRepository) InsertPlagiarismRequest(ctx context.Context, tx *sql.Tx, requestId, msId uint64, cid string) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO plagiarism_requests (request_id, ms_id, cid)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (request_id) DO NOTHING`,
		requestId, msId, cid,
	)
	return err
}

func (r *PostgresIndexerRepository) FulfillPlagiarismRequest(ctx context.Context, tx *sql.Tx, requestId, msId, score uint64) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE plagiarism_requests SET score = $1, fulfilled = TRUE, fulfilled_at = NOW() WHERE request_id = $2`,
		score, requestId,
	)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx,
		`UPDATE manuscripts SET plagiarism_score = $1, updated_at = NOW() WHERE ms_id = $2`,
		score, msId,
	)
	return err
}

func (r *PostgresIndexerRepository) InsertComment(ctx context.Context, tx *sql.Tx, comment CommentRow) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO doi_comments (doi_token_id, commenter_address, content_hash, tx_hash, block_number)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT DO NOTHING`,
		comment.DoiTokenId, strings.ToLower(comment.CommenterAddress), comment.ContentHash, comment.TxHash, comment.BlockNumber,
	)
	return err
}

func (r *PostgresIndexerRepository) InsertIncentivePayment(ctx context.Context, tx *sql.Tx, payment IncentiveRow) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO incentive_payments (reviewer_address, amount_wei, tx_hash, block_number)
		 VALUES ($1, $2, $3, $4)`,
		strings.ToLower(payment.ReviewerAddress), payment.AmountWei, payment.TxHash, payment.BlockNumber,
	)
	return err
}

func (r *PostgresIndexerRepository) InsertRevision(ctx context.Context, tx *sql.Tx, revision RevisionRow) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO manuscript_revisions (ms_id, new_cid, version, tx_hash, block_number)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT DO NOTHING`,
		revision.MsId, revision.NewCid, revision.Version, revision.TxHash, revision.BlockNumber,
	)
	return err
}
