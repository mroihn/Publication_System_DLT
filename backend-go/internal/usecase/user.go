package usecase

import (
	"context"
	"errors"
	"strings"

	"github.com/mroihn/ta-proj/backend-go/internal/repository"
)

type IdentityVerifier interface {
	Verify(ctx context.Context, token, audience string) (subject, email string, err error)
}

type UserUseCase struct {
	userRepo         repository.UserRepository
	identityVerifier IdentityVerifier
	googleClientID   string
}

func NewUserUseCase(userRepo repository.UserRepository, identityVerifier IdentityVerifier, googleClientID string) *UserUseCase {
	return &UserUseCase{userRepo: userRepo, identityVerifier: identityVerifier, googleClientID: googleClientID}
}

func (uc *UserUseCase) BindWallet(userID, walletAddress string) error {
	if len(walletAddress) != 42 {
		return errors.New("invalid Ethereum wallet address length")
	}

	addr := strings.ToLower(walletAddress)

	existing, err := uc.userRepo.FindByWalletAddress(addr)
	if err != nil {
		return err
	}
	if existing != nil && existing.ID != userID {
		return errors.New("wallet address is already bound to another account")
	}

	user, err := uc.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}

	user.WalletAddress = addr
	_, err = uc.userRepo.Save(user)
	return err
}

func (uc *UserUseCase) VerifyIdentity(ctx context.Context, userID, idToken string) (string, error) {
	subject, email, err := uc.identityVerifier.Verify(ctx, idToken, uc.googleClientID)
	if err != nil {
		return "", errors.New("invalid or expired identity token")
	}

	existing, err := uc.userRepo.FindByIdentity("google", subject)
	if err != nil {
		return "", err
	}
	if existing != nil && existing.ID != userID {
		return "", errors.New("this account is already verified by another user")
	}

	user, err := uc.userRepo.FindByID(userID)
	if err != nil {
		return "", err
	}
	if user == nil {
		return "", errors.New("user not found")
	}

	user.IdentityProvider = "google"
	user.IdentitySubject = subject
	user.IdentityEmail = email
	if _, err := uc.userRepo.Save(user); err != nil {
		return "", err
	}
	return email, nil
}
