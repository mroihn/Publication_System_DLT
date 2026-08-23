package usecase

import (
	"context"
	"testing"

	"github.com/mroihn/ta-proj/backend-go/internal/domain"
)

type fakeUserRepo struct {
	byID       map[string]*domain.User
	byIdentity map[string]*domain.User
}

func (f *fakeUserRepo) FindByID(id string) (*domain.User, error) {
	return f.byID[id], nil
}

func (f *fakeUserRepo) FindByEmail(email string) (*domain.User, error) {
	return nil, nil
}

func (f *fakeUserRepo) FindByWalletAddress(address string) (*domain.User, error) {
	return nil, nil
}

func (f *fakeUserRepo) FindByIdentity(provider, subject string) (*domain.User, error) {
	return f.byIdentity[provider+":"+subject], nil
}

func (f *fakeUserRepo) Save(user *domain.User) (*domain.User, error) {
	f.byID[user.ID] = user
	f.byIdentity[user.IdentityProvider+":"+user.IdentitySubject] = user
	return user, nil
}

type fakeVerifier struct {
	subject, email string
}

func (f fakeVerifier) Verify(ctx context.Context, token, audience string) (string, string, error) {
	return f.subject, f.email, nil
}

func TestVerifyIdentitySuccess(t *testing.T) {
	repo := &fakeUserRepo{
		byID:       map[string]*domain.User{"u1": {ID: "u1"}},
		byIdentity: map[string]*domain.User{},
	}
	uc := NewUserUseCase(repo, fakeVerifier{subject: "g-sub-1", email: "a@example.com"}, "client-id")

	email, err := uc.VerifyIdentity(context.Background(), "u1", "token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if email != "a@example.com" {
		t.Fatalf("got email %q", email)
	}
	if repo.byID["u1"].IdentityProvider != "google" || repo.byID["u1"].IdentitySubject != "g-sub-1" {
		t.Fatalf("identity not persisted: %+v", repo.byID["u1"])
	}
}

func TestVerifyIdentityConflict(t *testing.T) {
	repo := &fakeUserRepo{
		byID: map[string]*domain.User{
			"u1": {ID: "u1"},
			"u2": {ID: "u2", IdentityProvider: "google", IdentitySubject: "g-sub-1"},
		},
		byIdentity: map[string]*domain.User{
			"google:g-sub-1": {ID: "u2", IdentityProvider: "google", IdentitySubject: "g-sub-1"},
		},
	}
	uc := NewUserUseCase(repo, fakeVerifier{subject: "g-sub-1", email: "a@example.com"}, "client-id")

	if _, err := uc.VerifyIdentity(context.Background(), "u1", "token"); err == nil {
		t.Fatal("expected conflict error")
	}
}
