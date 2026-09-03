package repository

import (
	"context"
	"database/sql"
	"encoding/hex"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/mroihn/ta-proj/backend-go/internal/chainquery"
)

// ReviewerSession is the burner wallet created for a (manuscript, reviewer) pair.
type ReviewerSession struct {
	MsID           uint64 `json:"ms_id"`
	MainAddress    string `json:"mainAddress"`
	SessionAddress string `json:"sessionAddress"`
	SessionPrivKey string `json:"-"`
	Field          string `json:"field"`
}

// ReviewerSessionView is what a logged-in reviewer receives to sign a review.
type ReviewerSessionView struct {
	MsID           uint64 `json:"ms_id"`
	Status         string `json:"status"`
	SessionAddress string `json:"session_address"`
	SessionPrivKey string `json:"session_privkey"`
	Metadata       string `json:"metadata"`
	CID            string `json:"cid"`
	Reviewed       bool   `json:"reviewed"`
}

type SessionWalletRepository interface {
	SaveSubmissionWallet(userID, address string) error
	CreateReviewerSessionsForField(msId uint64, field string, count int) ([]ReviewerSession, error)
	GetReviewerSessionsForUser(userID, walletAddress string) ([]ReviewerSessionView, error)
}

type PostgresSessionWalletRepository struct {
	db       *sql.DB
	userRepo UserRepository
	registry *chainquery.RegistryReader
}

func NewPostgresSessionWalletRepository(db *sql.DB, userRepo UserRepository, registry *chainquery.RegistryReader) *PostgresSessionWalletRepository {
	return &PostgresSessionWalletRepository{db: db, userRepo: userRepo, registry: registry}
}

func (r *PostgresSessionWalletRepository) SaveSubmissionWallet(userID, address string) error {
	_, err := r.db.Exec(
		`INSERT INTO submission_wallets (user_id, address)
		 VALUES ($1, $2)
		 ON CONFLICT (address) DO NOTHING`,
		userID, address,
	)
	return err
}

// CreateReviewerSessionsForField selects up to `count` verified reviewers whose
// editor-verified fields include `field` and who have a bound wallet, then mints a
// fresh burner session wallet for each (double-blind: the reviewer's real address
// never touches the chain). Reviewers whose fields are still pending verification
// (empty verified_fields) are excluded. Returns the burner sessions to assign.
func (r *PostgresSessionWalletRepository) CreateReviewerSessionsForField(msId uint64, field string, count int) ([]ReviewerSession, error) {
	rows, err := r.db.Query(
		`SELECT id, wallet_address FROM users
		 WHERE role = 'reviewer'
		   AND $1 = ANY(verified_fields)
		   AND wallet_address IS NOT NULL AND wallet_address <> ''
		 ORDER BY random()
		 LIMIT $2`,
		field, count,
	)
	if err != nil {
		return nil, err
	}
	type cand struct{ userID, wallet string }
	var cands []cand
	for rows.Next() {
		var c cand
		if err := rows.Scan(&c.userID, &c.wallet); err != nil {
			rows.Close()
			return nil, err
		}
		cands = append(cands, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	out := make([]ReviewerSession, 0, len(cands))
	for _, c := range cands {
		key, err := crypto.GenerateKey()
		if err != nil {
			return nil, err
		}
		privHex := "0x" + hex.EncodeToString(crypto.FromECDSA(key))
		sessionAddr := crypto.PubkeyToAddress(key.PublicKey).Hex()
		userID := c.userID

		if _, err := tx.Exec(
			`INSERT INTO reviewer_sessions (ms_id, user_id, main_address, session_address, session_privkey, tier)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (ms_id, main_address) DO UPDATE
			   SET session_address = EXCLUDED.session_address,
			       session_privkey = EXCLUDED.session_privkey,
			       tier            = EXCLUDED.tier`,
			msId, userID, c.wallet, sessionAddr, privHex, field,
		); err != nil {
			return nil, err
		}

		out = append(out, ReviewerSession{
			MsID:           msId,
			MainAddress:    c.wallet,
			SessionAddress: sessionAddr,
			SessionPrivKey: privHex,
			Field:          field,
		})
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return out, nil
}

// GetReviewerSessionsForUser reads the reviewer's own burner session wallets
// from the off-chain reviewer_sessions table (unaffected — never mirrored
// on-chain data), then fills in each assignment's current manuscript
// status/metadata/cid and "did I review this round" flag directly from the
// contract. hasReviewed() only reflects the *current* round (it's reset on
// every revision), which is exactly what a reviewer's own assignment view
// needs — no historical reconstruction required here, unlike OpenReview.
func (r *PostgresSessionWalletRepository) GetReviewerSessionsForUser(userID, walletAddress string) ([]ReviewerSessionView, error) {
	rows, err := r.db.Query(
		`SELECT rs.ms_id, rs.session_address, rs.session_privkey
		 FROM reviewer_sessions rs
		 WHERE rs.user_id = $1 OR rs.main_address = $2
		 ORDER BY rs.ms_id DESC`,
		userID, walletAddress,
	)
	if err != nil {
		return nil, err
	}
	type row struct {
		msID    uint64
		address string
		privKey string
	}
	var raw []row
	for rows.Next() {
		var v row
		if err := rows.Scan(&v.msID, &v.address, &v.privKey); err != nil {
			rows.Close()
			return nil, err
		}
		raw = append(raw, v)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	ctx := context.Background()
	result := make([]ReviewerSessionView, 0, len(raw))
	for _, v := range raw {
		m, err := r.registry.GetManuscript(ctx, v.msID)
		if err != nil {
			return nil, err
		}
		reviewed, err := r.registry.HasReviewed(ctx, v.msID, common.HexToAddress(v.address))
		if err != nil {
			return nil, err
		}
		result = append(result, ReviewerSessionView{
			MsID:           v.msID,
			Status:         chainquery.StatusNames[m.Status],
			SessionAddress: v.address,
			SessionPrivKey: v.privKey,
			Metadata:       m.Metadata,
			CID:            m.CID,
			Reviewed:       reviewed,
		})
	}
	return result, nil
}
