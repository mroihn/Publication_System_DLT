package repository

import (
	"context"
	"database/sql"
	"sort"
	"time"

	"github.com/lib/pq"
	"github.com/mroihn/ta-proj/backend-go/internal/chainquery"
)

type FieldRequest struct {
	ID            int64     `json:"id"`
	UserID        string    `json:"user_id"`
	Email         string    `json:"email"`
	WalletAddress string    `json:"wallet_address"`
	Fields        []string  `json:"fields"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
	CurrentRole   string    `json:"current_role"`
	IdentityEmail string    `json:"identity_email"`
}

type PendingManuscript struct {
	MsID             uint64    `json:"ms_id"`
	CID              string    `json:"cid"`
	Metadata         string    `json:"metadata"`
	Status           string    `json:"status"`
	Field            *string   `json:"field"`
	AuthorAddress    string    `json:"author_address"`
	CreatedAt        time.Time `json:"created_at"`
	JournalName      *string   `json:"journal_name"`
	JournalCategory  *string   `json:"journal_category"`
	AssignedEditorID *string   `json:"assigned_editor_id"`
}

type EditorRepository interface {
	CreatePendingFieldRequest(userID string, fields []string) error
	ListPendingFieldRequests() ([]FieldRequest, error)
	GetFieldRequest(id int64) (*FieldRequest, error)
	GetLatestFieldRequestForUser(userID string) (*FieldRequest, error)
	MarkFieldRequestApproved(id int64, editorID string, fields []string) error
	RejectFieldRequest(id int64, editorID string) error
	ListManuscriptsByStatus(status, editorID string) ([]PendingManuscript, error)
	GetManuscriptAssignment(msId uint64) (*string, bool, error)
}

type PostgresEditorRepository struct {
	db       *sql.DB
	registry *chainquery.RegistryReader
}

func NewPostgresEditorRepository(db *sql.DB, registry *chainquery.RegistryReader) *PostgresEditorRepository {
	return &PostgresEditorRepository{db: db, registry: registry}
}

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

const fieldRequestSelectCols = `rfr.id, rfr.user_id, u.email, COALESCE(u.wallet_address, ''),
		        rfr.fields, rfr.status, rfr.created_at, u.role, COALESCE(u.identity_email, '')`

func (r *PostgresEditorRepository) ListPendingFieldRequests() ([]FieldRequest, error) {
	rows, err := r.db.Query(
		`SELECT ` + fieldRequestSelectCols + `
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
			pq.Array(&fr.Fields), &fr.Status, &fr.CreatedAt, &fr.CurrentRole, &fr.IdentityEmail); err != nil {
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
		`SELECT `+fieldRequestSelectCols+`
		 FROM reviewer_field_requests rfr
		 JOIN users u ON u.id = rfr.user_id
		 WHERE rfr.id = $1`, id,
	).Scan(&fr.ID, &fr.UserID, &fr.Email, &fr.WalletAddress,
		pq.Array(&fr.Fields), &fr.Status, &fr.CreatedAt, &fr.CurrentRole, &fr.IdentityEmail)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &fr, nil
}

func (r *PostgresEditorRepository) GetLatestFieldRequestForUser(userID string) (*FieldRequest, error) {
	var fr FieldRequest
	err := r.db.QueryRow(
		`SELECT `+fieldRequestSelectCols+`
		 FROM reviewer_field_requests rfr
		 JOIN users u ON u.id = rfr.user_id
		 WHERE rfr.user_id = $1
		 ORDER BY rfr.created_at DESC
		 LIMIT 1`, userID,
	).Scan(&fr.ID, &fr.UserID, &fr.Email, &fr.WalletAddress,
		pq.Array(&fr.Fields), &fr.Status, &fr.CreatedAt, &fr.CurrentRole, &fr.IdentityEmail)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &fr, nil
}

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
		`UPDATE users SET verified_fields = $2, role = CASE WHEN role = 'user' THEN 'reviewer' ELSE role END, updated_at = NOW() WHERE id = $1`,
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

// ListManuscriptsByStatus enumerates every manuscript ID and reads each one
// directly from the contract, filtering by status in memory — the contract
// has no "list by status" query. Acceptable at today's manuscript count;
// does not scale indefinitely (see Bab V Keterbatasan). Only manuscripts
// assigned to this editor, or still unassigned, are returned.
func (r *PostgresEditorRepository) ListManuscriptsByStatus(status, editorID string) ([]PendingManuscript, error) {
	ctx := context.Background()
	next, err := r.registry.NextManuscriptID(ctx)
	if err != nil {
		return nil, err
	}

	out := []PendingManuscript{}
	for id := uint64(0); id < next; id++ {
		m, err := r.registry.GetManuscript(ctx, id)
		if err != nil {
			return nil, err
		}
		if chainquery.StatusNames[m.Status] != status {
			continue
		}
		journalID := journalIDFromMetadata(m.Metadata)
		assigned, err := r.ensureAssignment(m.ID, journalID)
		if err != nil {
			return nil, err
		}
		if assigned != nil && *assigned != editorID {
			continue
		}
		var field *string
		if m.Field != "" {
			f := m.Field
			field = &f
		}
		pm := PendingManuscript{
			MsID:             m.ID,
			CID:              m.CID,
			Metadata:         m.Metadata,
			Status:           chainquery.StatusNames[m.Status],
			Field:            field,
			AuthorAddress:    m.Author.Hex(),
			AssignedEditorID: assigned,
		}
		if journalID != nil {
			var name, category string
			err := r.db.QueryRow(`SELECT name, category_slug FROM journals WHERE id = $1`, *journalID).Scan(&name, &category)
			if err == nil {
				pm.JournalName, pm.JournalCategory = &name, &category
			} else if err != sql.ErrNoRows {
				return nil, err
			}
		}
		out = append(out, pm)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MsID > out[j].MsID })
	return out, nil
}

// GetManuscriptAssignment returns the editor responsible for a manuscript,
// assigning one first if none has been chosen yet. The bool reports whether
// the manuscript exists; a nil id means no editor account exists at all.
func (r *PostgresEditorRepository) GetManuscriptAssignment(msId uint64) (*string, bool, error) {
	ctx := context.Background()
	next, err := r.registry.NextManuscriptID(ctx)
	if err != nil {
		return nil, false, err
	}
	if msId >= next {
		return nil, false, nil
	}
	m, err := r.registry.GetManuscript(ctx, msId)
	if err != nil {
		return nil, false, err
	}
	assigned, err := r.ensureAssignment(msId, journalIDFromMetadata(m.Metadata))
	return assigned, true, err
}

func (r *PostgresEditorRepository) ensureAssignment(msId uint64, journalID *int64) (*string, error) {
	if err := AssignEditor(r.db, msId, journalID); err != nil {
		return nil, err
	}
	var editorID string
	err := r.db.QueryRow(`SELECT assigned_editor_id FROM manuscript_assignments WHERE ms_id = $1`, msId).Scan(&editorID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &editorID, nil
}

// AssignEditor picks the editor who will desk-review a manuscript: at random
// among editors whose verified_fields cover the chosen journal's category, and
// failing that at random among all editors. It is assigned lazily, the first
// time an editor lists or reviews the manuscript, since there is no indexer to
// react to ManuscriptSubmitted. The ms_id primary key makes concurrent calls
// safe and keeps the first choice. With no editors at all nothing is stored,
// so the manuscript stays visible to every editor until one exists.
func AssignEditor(db *sql.DB, msId uint64, journalID *int64) error {
	_, err := db.Exec(
		`INSERT INTO manuscript_assignments (ms_id, assigned_editor_id)
		 SELECT $1, pick.editor_id FROM (SELECT COALESCE(
		   (SELECT u.id FROM users u JOIN journals j ON j.id = $2::int
		     WHERE u.role = 'editor' AND j.category_slug = ANY(u.verified_fields)
		     ORDER BY random() LIMIT 1),
		   (SELECT u.id FROM users u WHERE u.role = 'editor' ORDER BY random() LIMIT 1)
		 ) AS editor_id) pick
		 WHERE pick.editor_id IS NOT NULL
		 ON CONFLICT (ms_id) DO NOTHING`,
		msId, journalID,
	)
	return err
}
