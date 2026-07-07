package repository

import (
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/mroihn/ta-proj/backend-go/internal/domain"
)

type PostgresUserRepository struct {
	db *sql.DB
}

func NewPostgresUserRepository(db *sql.DB) *PostgresUserRepository {
	return &PostgresUserRepository{db: db}
}

const userSelectCols = `id, email, password_hash, wallet_address, role, specialities, verified_fields`

// scanUser reads a single user row selected with userSelectCols.
func scanUser(row *sql.Row) (*domain.User, error) {
	u := &domain.User{}
	var wallet sql.NullString
	err := row.Scan(&u.ID, &u.Email, &u.Password, &wallet, &u.Role, pq.Array(&u.Specialities), pq.Array(&u.VerifiedFields))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.WalletAddress = wallet.String
	return u, nil
}

func (r *PostgresUserRepository) FindByID(id string) (*domain.User, error) {
	return scanUser(r.db.QueryRow(
		`SELECT `+userSelectCols+` FROM users WHERE id = $1`, id,
	))
}

func (r *PostgresUserRepository) FindByEmail(email string) (*domain.User, error) {
	return scanUser(r.db.QueryRow(
		`SELECT `+userSelectCols+` FROM users WHERE email = $1`, email,
	))
}

func (r *PostgresUserRepository) FindByWalletAddress(address string) (*domain.User, error) {
	return scanUser(r.db.QueryRow(
		`SELECT `+userSelectCols+` FROM users WHERE wallet_address = $1`, address,
	))
}

func (r *PostgresUserRepository) Save(user *domain.User) (*domain.User, error) {
	if user.ID == "" {
		user.ID = uuid.New().String()
	}
	if user.Role == "" {
		user.Role = "user"
	}
	// pq.Array(nil) emits SQL NULL, which violates the NOT NULL specialities column.
	specialities := user.Specialities
	if specialities == nil {
		specialities = []string{}
	}
	var wallet sql.NullString
	if user.WalletAddress != "" {
		wallet = sql.NullString{String: user.WalletAddress, Valid: true}
	}
	_, err := r.db.Exec(
		`INSERT INTO users (id, email, password_hash, wallet_address, role, specialities, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW())
		 ON CONFLICT (id) DO UPDATE SET
		   email          = EXCLUDED.email,
		   password_hash  = EXCLUDED.password_hash,
		   wallet_address = EXCLUDED.wallet_address,
		   role           = EXCLUDED.role,
		   specialities   = EXCLUDED.specialities,
		   updated_at     = NOW()`,
		user.ID, user.Email, user.Password, wallet, user.Role, pq.Array(specialities),
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}
