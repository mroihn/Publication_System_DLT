package repository

import "github.com/mroihn/ta-proj/backend-go/internal/domain"

type UserRepository interface {
	FindByID(id string) (*domain.User, error)
	FindByEmail(email string) (*domain.User, error)
	FindByWalletAddress(address string) (*domain.User, error)
	FindByIdentity(provider, subject string) (*domain.User, error)
	Save(user *domain.User) (*domain.User, error)
}
