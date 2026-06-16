package repository

import (
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/mroihn/ta-proj/backend-go/internal/domain"
)

type PostgresUserRepository struct {
	db *sql.DB
}

func NewPostgresUserRepository(db *sql.DB) *PostgresUserRepository {
	return &PostgresUserRepository{db: db}
}

func (r *PostgresUserRepository) FindByID(id string) (*domain.User, error) {
	u := &domain.User{}
	var wallet sql.NullString
	err := r.db.QueryRow(
		`SELECT id, email, password_hash, wallet_address FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.Password, &wallet)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.WalletAddress = wallet.String
	return u, nil
}

func (r *PostgresUserRepository) FindByEmail(email string) (*domain.User, error) {
	u := &domain.User{}
	var wallet sql.NullString
	err := r.db.QueryRow(
		`SELECT id, email, password_hash, wallet_address FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.Password, &wallet)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.WalletAddress = wallet.String
	return u, nil
}

func (r *PostgresUserRepository) FindByWalletAddress(address string) (*domain.User, error) {
	u := &domain.User{}
	var wallet sql.NullString
	err := r.db.QueryRow(
		`SELECT id, email, password_hash, wallet_address FROM users WHERE wallet_address = $1`, address,
	).Scan(&u.ID, &u.Email, &u.Password, &wallet)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.WalletAddress = wallet.String
	return u, nil
}

func (r *PostgresUserRepository) Save(user *domain.User) (*domain.User, error) {
	if user.ID == "" {
		user.ID = uuid.New().String()
	}
	var wallet sql.NullString
	if user.WalletAddress != "" {
		wallet = sql.NullString{String: user.WalletAddress, Valid: true}
	}
	_, err := r.db.Exec(
		`INSERT INTO users (id, email, password_hash, wallet_address, updated_at)
		 VALUES ($1, $2, $3, $4, NOW())
		 ON CONFLICT (id) DO UPDATE SET
		   email          = EXCLUDED.email,
		   password_hash  = EXCLUDED.password_hash,
		   wallet_address = EXCLUDED.wallet_address,
		   updated_at     = NOW()`,
		user.ID, user.Email, user.Password, wallet,
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}
