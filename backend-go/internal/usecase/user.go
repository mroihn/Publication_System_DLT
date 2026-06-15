package usecase

import (
	"errors"
	"strings"

	"github.com/mroihn/ta-proj/backend-go/internal/repository"
)

type UserUseCase struct {
	userRepo repository.UserRepository
}

func NewUserUseCase(userRepo repository.UserRepository) *UserUseCase {
	return &UserUseCase{userRepo: userRepo}
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
