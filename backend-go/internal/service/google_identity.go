package service

import (
	"context"
	"fmt"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

const googleJWKSURL = "https://www.googleapis.com/oauth2/v3/certs"

var googleIssuers = map[string]bool{
	"accounts.google.com":         true,
	"https://accounts.google.com": true,
}

type googleClaims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

type GoogleIdentityVerifier struct{}

func (GoogleIdentityVerifier) Verify(ctx context.Context, token, audience string) (string, string, error) {
	jwks, err := keyfunc.NewDefaultCtx(ctx, []string{googleJWKSURL})
	if err != nil {
		return "", "", fmt.Errorf("fetch google jwks: %w", err)
	}

	var claims googleClaims
	parsed, err := jwt.ParseWithClaims(token, &claims, jwks.Keyfunc, jwt.WithValidMethods([]string{"RS256"}))
	if err != nil || !parsed.Valid {
		return "", "", fmt.Errorf("invalid google id token: %w", err)
	}
	if !googleIssuers[claims.Issuer] {
		return "", "", fmt.Errorf("unexpected issuer: %s", claims.Issuer)
	}
	if len(claims.Audience) == 0 || claims.Audience[0] != audience {
		return "", "", fmt.Errorf("unexpected audience")
	}
	if claims.Subject == "" || claims.Email == "" {
		return "", "", fmt.Errorf("google id token missing subject or email")
	}
	return claims.Subject, claims.Email, nil
}
