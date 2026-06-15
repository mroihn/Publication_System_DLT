package repository

import (
	"sync"

	"github.com/google/uuid"
	"github.com/mroihn/ta-proj/backend-go/internal/domain"
)

type InMemoryUserRepository struct {
	mu    sync.RWMutex
	users []*domain.User
}

func NewInMemoryUserRepository() *InMemoryUserRepository {
	return &InMemoryUserRepository{}
}

func (r *InMemoryUserRepository) FindByID(id string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, u := range r.users {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, nil
}

func (r *InMemoryUserRepository) FindByEmail(email string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, u := range r.users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, nil
}

func (r *InMemoryUserRepository) FindByWalletAddress(address string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, u := range r.users {
		if u.WalletAddress == address {
			return u, nil
		}
	}
	return nil, nil
}

func (r *InMemoryUserRepository) Save(user *domain.User) (*domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if user.ID == "" {
		user.ID = uuid.New().String()
		r.users = append(r.users, user)
		return user, nil
	}
	for i, u := range r.users {
		if u.ID == user.ID {
			r.users[i] = user
			return user, nil
		}
	}
	r.users = append(r.users, user)
	return user, nil
}
