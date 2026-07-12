package repository

import (
	"context"
	"database/sql"
	"time"
)

type CommentView struct {
	CommenterAddress string    `json:"commenter_address"`
	ContentHash      string    `json:"content_hash"`
	Body             string    `json:"body"`
	CID              string    `json:"cid"`
	TxHash           string    `json:"tx_hash"`
	BlockNumber      int64     `json:"block_number"`
	PostedAt         time.Time `json:"posted_at"`
}

type CommentRepository struct {
	db *sql.DB
}

func NewCommentRepository(db *sql.DB) *CommentRepository {
	return &CommentRepository{db: db}
}

func (r *CommentRepository) DOITokenID(ctx context.Context, msId uint64) (int64, bool, error) {
	var id sql.NullInt64
	err := r.db.QueryRowContext(ctx, `SELECT doi_token_id FROM manuscripts WHERE ms_id = $1`, msId).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return id.Int64, id.Valid, nil
}

func (r *CommentRepository) SaveContent(ctx context.Context, hash string, doiTokenID int64, cid, body string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO comment_contents (content_hash, doi_token_id, cid, body)
		 VALUES ($1, $2, $3, $4) ON CONFLICT (content_hash) DO NOTHING`,
		hash, doiTokenID, cid, body,
	)
	return err
}

// ListForDOI returns on-chain comments (from the indexer) joined with their
// off-chain text, chronologically.
func (r *CommentRepository) ListForDOI(ctx context.Context, doiTokenID int64) ([]CommentView, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT dc.commenter_address, dc.content_hash, COALESCE(dc.tx_hash,''),
		        COALESCE(dc.block_number,0), dc.posted_at,
		        COALESCE(cc.body,''), COALESCE(cc.cid,'')
		 FROM doi_comments dc
		 LEFT JOIN comment_contents cc ON cc.content_hash = dc.content_hash
		 WHERE dc.doi_token_id = $1
		 ORDER BY dc.posted_at`, doiTokenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CommentView
	for rows.Next() {
		var c CommentView
		if err := rows.Scan(&c.CommenterAddress, &c.ContentHash, &c.TxHash,
			&c.BlockNumber, &c.PostedAt, &c.Body, &c.CID); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if out == nil {
		out = []CommentView{}
	}
	return out, rows.Err()
}
