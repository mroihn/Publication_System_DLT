package usecase

import (
	"errors"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/mroihn/ta-proj/backend-go/internal/domain"
	"github.com/mroihn/ta-proj/backend-go/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

type AuthUseCase struct {
	userRepo  repository.UserRepository
	jwtSecret string
}

func NewAuthUseCase(userRepo repository.UserRepository, jwtSecret string) *AuthUseCase {
	return &AuthUseCase{userRepo: userRepo, jwtSecret: jwtSecret}
}

func (uc *AuthUseCase) Register(email, plainPassword string) (*domain.User, error) {
	email = strings.ToLower(email)

	existing, err := uc.userRepo.FindByEmail(email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, errors.New("email is already registered")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(plainPassword), 10)
	if err != nil {
		return nil, err
	}

	user := &domain.User{Email: email, Password: string(hashed)}
	return uc.userRepo.Save(user)
}

type LoginResult struct {
	AccessToken string      `json:"accessToken"`
	User        *domain.User `json:"user"`
}

func (uc *AuthUseCase) Login(email, plainPassword string) (*LoginResult, error) {
	email = strings.ToLower(email)

	user, err := uc.userRepo.FindByEmail(email)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, errors.New("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(plainPassword)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"exp":   time.Now().Add(time.Hour).Unix(),
	})
	signed, err := token.SignedString([]byte(uc.jwtSecret))
	if err != nil {
		return nil, err
	}

	return &LoginResult{AccessToken: signed, User: user}, nil
}
