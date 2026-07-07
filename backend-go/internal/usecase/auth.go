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

// allowedSpecialities is the fixed set a reviewer can pick from (stored as slugs).
var allowedSpecialities = map[string]bool{
	"ai":                true,
	"computer-security": true,
	"blockchain":        true,
	"cloud-computing":   true,
	"data-science":      true,
}

func (uc *AuthUseCase) Register(email, plainPassword, role string, specialities []string) (*domain.User, error) {
	email = strings.ToLower(email)

	role = strings.ToLower(strings.TrimSpace(role))
	if role == "" {
		role = "user"
	}
	if role != "user" && role != "reviewer" {
		return nil, errors.New("role must be either 'user' or 'reviewer'")
	}

	// Specialities only apply to reviewers; validate + de-duplicate.
	var cleaned []string
	if role == "reviewer" {
		seen := map[string]bool{}
		for _, s := range specialities {
			s = strings.ToLower(strings.TrimSpace(s))
			if s == "" || seen[s] {
				continue
			}
			if !allowedSpecialities[s] {
				return nil, errors.New("invalid speciality: " + s)
			}
			seen[s] = true
			cleaned = append(cleaned, s)
		}
		if len(cleaned) == 0 {
			return nil, errors.New("reviewers must select at least one speciality")
		}
	}

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

	user := &domain.User{Email: email, Password: string(hashed), Role: role, Specialities: cleaned}
	return uc.userRepo.Save(user)
}

type LoginResult struct {
	AccessToken string       `json:"accessToken"`
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
