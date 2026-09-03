package repository

import (
	"database/sql"
)

// Identity is a resolved, unanonymized participant for the open-review views.
type Identity struct {
	Address    string `json:"address"`     // the on-chain address (burner or real)
	Email      string `json:"email"`       // "" when unresolved
	RealWallet string `json:"real_wallet"` // the participant's real bound wallet
}

type IdentityResolver struct {
	db *sql.DB
}

func NewIdentityResolver(db *sql.DB) *IdentityResolver {
	return &IdentityResolver{db: db}
}

// ResolveAuthor maps a manuscript's on-chain author (a burner SubmissionWallet)
// to the registered user, falling back to the raw address.
func (r *IdentityResolver) ResolveAuthor(address string) Identity {
	id := Identity{Address: address, RealWallet: address}
	if address == "" {
		return id
	}
	var email, wallet sql.NullString
	err := r.db.QueryRow(
		`SELECT u.email, u.wallet_address
		 FROM submission_wallets sw JOIN users u ON u.id = sw.user_id
		 WHERE lower(sw.address) = lower($1) LIMIT 1`, address,
	).Scan(&email, &wallet)
	if err == nil {
		id.Email = email.String
		if wallet.String != "" {
			id.RealWallet = wallet.String
		}
	}
	return id
}

// ResolveCommenter maps a reader's real wallet to their email when they are a
// registered user; the wallet is already public.
func (r *IdentityResolver) ResolveCommenter(address string) Identity {
	id := Identity{Address: address, RealWallet: address}
	if address == "" {
		return id
	}
	var email sql.NullString
	if err := r.db.QueryRow(
		`SELECT email FROM users WHERE lower(wallet_address) = lower($1) LIMIT 1`, address,
	).Scan(&email); err == nil {
		id.Email = email.String
	}
	return id
}

// DisplayName returns the email when known, else a short address.
func (i Identity) DisplayName() string {
	if i.Email != "" {
		return i.Email
	}
	a := i.Address
	if len(a) > 12 {
		return a[:6] + "…" + a[len(a)-4:]
	}
	return a
}
