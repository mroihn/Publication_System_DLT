package repository

import (
	"database/sql"
	"time"

	"github.com/lib/pq"
)

// FieldRequest is a reviewer's pending/decided specialization verification.
type FieldRequest struct {
	ID            int64     `json:"id"`
	UserID        string    `json:"user_id"`
	Email         string    `json:"email"`
	WalletAddress string    `json:"wallet_address"`
	Fields        []string  `json:"fields"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

// PendingManuscript is a manuscript awaiting editor screening.
type PendingManuscript struct {
	MsID          uint64    `json:"ms_id"`
	CID           string    `json:"cid"`
	Metadata      string    `json:"metadata"`
	Status        string    `json:"status"`
	Field         *string   `json:"field"`
	AuthorAddress string    `json:"author_address"`
	CreatedAt     time.Time `json:"created_at"`
}

type EditorRepository interface {
	CreatePendingFieldRequest(userID string, fields []string) error
	ListPendingFieldRequests() ([]FieldRequest, error)
	GetFieldRequest(id int64) (*FieldRequest, error)
	MarkFieldRequestApproved(id int64, editorID string, fields []string) error
	RejectFieldRequest(id int64, editorID string) error
	ListManuscriptsByStatus(status string) ([]PendingManuscript, error)
}

type PostgresEditorRepository struct {
	db *sql.DB
}

func NewPostgresEditorRepository(db *sql.DB) *PostgresEditorRepository {
	return &PostgresEditorRepository{db: db}
}

// CreatePendingFieldRequest supersedes any earlier still-pending request for the
// same reviewer (a resubmission), then inserts a fresh pending one.
func (r *PostgresEditorRepository) CreatePendingFieldRequest(userID string, fields []string) error {
	if fields == nil {
		fields = []string{}
	}
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`UPDATE reviewer_field_requests SET status = 'superseded', updated_at = NOW()
		 WHERE user_id = $1 AND status = 'pending'`, userID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`INSERT INTO reviewer_field_requests (user_id, fields) VALUES ($1, $2)`,
		userID, pq.Array(fields),
	); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *PostgresEditorRepository) ListPendingFieldRequests() ([]FieldRequest, error) {
	rows, err := r.db.Query(
		`SELECT rfr.id, rfr.user_id, u.email, COALESCE(u.wallet_address, ''),
		        rfr.fields, rfr.status, rfr.created_at
		 FROM reviewer_field_requests rfr
		 JOIN users u ON u.id = rfr.user_id
		 WHERE rfr.status = 'pending'
		 ORDER BY rfr.created_at`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []FieldRequest
	for rows.Next() {
		var fr FieldRequest
		if err := rows.Scan(&fr.ID, &fr.UserID, &fr.Email, &fr.WalletAddress,
			pq.Array(&fr.Fields), &fr.Status, &fr.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, fr)
	}
	if out == nil {
		out = []FieldRequest{}
	}
	return out, rows.Err()
}

func (r *PostgresEditorRepository) GetFieldRequest(id int64) (*FieldRequest, error) {
	var fr FieldRequest
	err := r.db.QueryRow(
		`SELECT rfr.id, rfr.user_id, u.email, COALESCE(u.wallet_address, ''),
		        rfr.fields, rfr.status, rfr.created_at
		 FROM reviewer_field_requests rfr
		 JOIN users u ON u.id = rfr.user_id
		 WHERE rfr.id = $1`, id,
	).Scan(&fr.ID, &fr.UserID, &fr.Email, &fr.WalletAddress,
		pq.Array(&fr.Fields), &fr.Status, &fr.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &fr, nil
}

// MarkFieldRequestApproved is called after the on-chain relay succeeds: it marks
// the request approved and mirrors the verified fields onto the user row.
func (r *PostgresEditorRepository) MarkFieldRequestApproved(id int64, editorID string, fields []string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var userID string
	if err := tx.QueryRow(
		`UPDATE reviewer_field_requests
		 SET status = 'approved', decided_by = $2, updated_at = NOW()
		 WHERE id = $1 RETURNING user_id`, id, editorID,
	).Scan(&userID); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`UPDATE users SET verified_fields = $2, updated_at = NOW() WHERE id = $1`,
		userID, pq.Array(fields),
	); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *PostgresEditorRepository) RejectFieldRequest(id int64, editorID string) error {
	_, err := r.db.Exec(
		`UPDATE reviewer_field_requests
		 SET status = 'rejected', decided_by = $2, updated_at = NOW()
		 WHERE id = $1 AND status = 'pending'`, id, editorID,
	)
	return err
}

func (r *PostgresEditorRepository) ListManuscriptsByStatus(status string) ([]PendingManuscript, error) {
	rows, err := r.db.Query(
		`SELECT ms_id, COALESCE(cid,''), COALESCE(metadata,''), COALESCE(status,''),
		        field, COALESCE(author_address,''), created_at
		 FROM manuscripts WHERE status = $1 ORDER BY ms_id DESC`, status,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PendingManuscript
	for rows.Next() {
		var m PendingManuscript
		if err := rows.Scan(&m.MsID, &m.CID, &m.Metadata, &m.Status, &m.Field, &m.AuthorAddress, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	if out == nil {
		out = []PendingManuscript{}
	}
	return out, rows.Err()
}
