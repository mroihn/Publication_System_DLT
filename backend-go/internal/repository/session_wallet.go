package repository

import (
	"database/sql"
	"encoding/hex"

	"github.com/ethereum/go-ethereum/crypto"
)

// ReviewerSessionSeed is one reviewer the oracle wants a burner wallet for.
type ReviewerSessionSeed struct {
	MainAddress string `json:"mainAddress"`
	Tier        string `json:"tier"`
}

// ReviewerSession is the burner wallet created for a (manuscript, reviewer) pair.
type ReviewerSession struct {
	MsID           uint64 `json:"ms_id"`
	MainAddress    string `json:"mainAddress"`
	SessionAddress string `json:"sessionAddress"`
	SessionPrivKey string `json:"-"`
	Tier           string `json:"tier"`
}

// ReviewerSessionView is what a logged-in reviewer receives to sign a review.
type ReviewerSessionView struct {
	MsID           uint64 `json:"ms_id"`
	Status         string `json:"status"`
	SessionAddress string `json:"session_address"`
	SessionPrivKey string `json:"session_privkey"`
}

type SessionWalletRepository interface {
	SaveSubmissionWallet(userID, address string) error
	CreateReviewerSessions(msId uint64, seeds []ReviewerSessionSeed) ([]ReviewerSession, error)
	GetReviewerSessionsForUser(userID, walletAddress string) ([]ReviewerSessionView, error)
}

type PostgresSessionWalletRepository struct {
	db       *sql.DB
	userRepo UserRepository
}

func NewPostgresSessionWalletRepository(db *sql.DB, userRepo UserRepository) *PostgresSessionWalletRepository {
	return &PostgresSessionWalletRepository{db: db, userRepo: userRepo}
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

// CreateReviewerSessions generates a fresh keypair for each seed, links it to a
// registered reviewer (by bound wallet) when one exists, and persists the mapping.
// The returned slice preserves the input order so the oracle can submit the burner
// addresses to fulfillReviewerSelection in the same tier order it selected.
func (r *PostgresSessionWalletRepository) CreateReviewerSessions(msId uint64, seeds []ReviewerSessionSeed) ([]ReviewerSession, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	out := make([]ReviewerSession, 0, len(seeds))
	for _, seed := range seeds {
		key, err := crypto.GenerateKey()
		if err != nil {
			return nil, err
		}
		privHex := "0x" + hex.EncodeToString(crypto.FromECDSA(key))
		sessionAddr := crypto.PubkeyToAddress(key.PublicKey).Hex()

		// Link to a registered reviewer if their bound wallet matches (nullable).
		var userID *string
		if u, uerr := r.userRepo.FindByWalletAddress(seed.MainAddress); uerr == nil && u != nil {
			userID = &u.ID
		}

		if _, err := tx.Exec(
			`INSERT INTO reviewer_sessions (ms_id, user_id, main_address, session_address, session_privkey, tier)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (ms_id, main_address) DO UPDATE
			   SET session_address = EXCLUDED.session_address,
			       session_privkey = EXCLUDED.session_privkey,
			       tier            = EXCLUDED.tier`,
			msId, userID, seed.MainAddress, sessionAddr, privHex, seed.Tier,
		); err != nil {
			return nil, err
		}

		out = append(out, ReviewerSession{
			MsID:           msId,
			MainAddress:    seed.MainAddress,
			SessionAddress: sessionAddr,
			SessionPrivKey: privHex,
			Tier:           seed.Tier,
		})
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *PostgresSessionWalletRepository) GetReviewerSessionsForUser(userID, walletAddress string) ([]ReviewerSessionView, error) {
	rows, err := r.db.Query(
		`SELECT rs.ms_id, COALESCE(m.status, ''), rs.session_address, rs.session_privkey
		 FROM reviewer_sessions rs
		 LEFT JOIN manuscripts m ON m.ms_id = rs.ms_id
		 WHERE rs.user_id = $1 OR rs.main_address = $2
		 ORDER BY rs.ms_id DESC`,
		userID, walletAddress,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ReviewerSessionView
	for rows.Next() {
		var v ReviewerSessionView
		if err := rows.Scan(&v.MsID, &v.Status, &v.SessionAddress, &v.SessionPrivKey); err != nil {
			return nil, err
		}
		result = append(result, v)
	}
	if result == nil {
		result = []ReviewerSessionView{}
	}
	return result, rows.Err()
}
