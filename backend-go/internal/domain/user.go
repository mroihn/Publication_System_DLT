package domain

type User struct {
	ID               string
	Email            string
	Password         string
	WalletAddress    string
	Role             string
	Specialities     []string
	VerifiedFields   []string
	IdentityProvider string
	IdentitySubject  string
	IdentityEmail    string
}
