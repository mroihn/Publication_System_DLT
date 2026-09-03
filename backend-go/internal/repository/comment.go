package repository

import (
	"context"
	"database/sql"
	"encoding/hex"
	"sort"
	"time"

	"github.com/mroihn/ta-proj/backend-go/internal/chainquery"
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

// CommentRepository blends two sources: on-chain CommentPosted events (who
// commented, when, and the content hash) and the off-chain comment_contents
// table (the actual body text, which never touches the chain — only its
// hash does). The table is not an on-chain mirror and stays.
type CommentRepository struct {
	db       *sql.DB
	registry *chainquery.RegistryReader
	doiToken *chainquery.DOITokenReader
}

func NewCommentRepository(db *sql.DB, registry *chainquery.RegistryReader, doiToken *chainquery.DOITokenReader) *CommentRepository {
	return &CommentRepository{db: db, registry: registry, doiToken: doiToken}
}

// DOITokenID has no contract-view equivalent — doiTokenId is never stored on
// the manuscript struct, only ever emitted as an event arg.
func (r *CommentRepository) DOITokenID(ctx context.Context, msId uint64) (int64, bool, error) {
	logs, err := r.registry.LogsForManuscript(ctx, msId, "DOIMinted")
	if err != nil {
		return 0, false, err
	}
	if len(logs) == 0 {
		return 0, false, nil
	}
	return chainquery.BigIntArg(logs[0].Args, "doiTokenId").Int64(), true, nil
}

func (r *CommentRepository) SaveContent(ctx context.Context, hash string, doiTokenID int64, cid, body string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO comment_contents (content_hash, doi_token_id, cid, body)
		 VALUES ($1, $2, $3, $4) ON CONFLICT (content_hash) DO NOTHING`,
		hash, doiTokenID, cid, body,
	)
	return err
}

// ListForDOI returns on-chain comments (from CommentPosted logs) joined with
// their off-chain text by content hash, chronologically.
func (r *CommentRepository) ListForDOI(ctx context.Context, doiTokenID int64) ([]CommentView, error) {
	logs, err := r.doiToken.CommentLogsForDOI(ctx, uint64(doiTokenID))
	if err != nil {
		return nil, err
	}
	sort.Slice(logs, func(i, j int) bool {
		if logs[i].Raw.BlockNumber != logs[j].Raw.BlockNumber {
			return logs[i].Raw.BlockNumber < logs[j].Raw.BlockNumber
		}
		return logs[i].Raw.Index < logs[j].Raw.Index
	})

	out := make([]CommentView, 0, len(logs))
	for _, l := range logs {
		hashBytes := chainquery.Bytes32Arg(l.Args, "hash")
		hashHex := "0x" + hex.EncodeToString(hashBytes[:])

		var body, cid sql.NullString
		_ = r.db.QueryRowContext(ctx,
			`SELECT body, cid FROM comment_contents WHERE content_hash = $1`, hashHex,
		).Scan(&body, &cid)

		t, err := chainquery.BlockTime(ctx, r.doiToken.Client(), l.Raw.BlockNumber)
		if err != nil {
			return nil, err
		}

		out = append(out, CommentView{
			CommenterAddress: chainquery.AddressArg(l.Args, "reader").Hex(),
			ContentHash:      hashHex,
			Body:             body.String,
			CID:              cid.String,
			TxHash:           l.Raw.TxHash.Hex(),
			BlockNumber:      int64(l.Raw.BlockNumber),
			PostedAt:         t,
		})
	}
	return out, nil
}
