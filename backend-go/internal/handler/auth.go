package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/domain"
	"github.com/mroihn/ta-proj/backend-go/internal/usecase"
)

type AuthHandler struct {
	authUC *usecase.AuthUseCase
}

func NewAuthHandler(authUC *usecase.AuthUseCase) *AuthHandler {
	return &AuthHandler{authUC: authUC}
}

func (h *AuthHandler) Register(c *gin.Context) {
	var body struct {
		Email        string   `json:"email" binding:"required"`
		Password     string   `json:"password" binding:"required"`
		Role         string   `json:"role"`
		Specialities []string `json:"specialities"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}

	user, err := h.authUC.Register(body.Email, body.Password, body.Role, body.Specialities)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "already registered") {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "User registered successfully",
		"user": gin.H{
			"id":           user.ID,
			"email":        user.Email,
			"role":         user.Role,
			"specialities": user.Specialities,
		},
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var body struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}

	result, err := h.authUC.Login(body.Email, body.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"accessToken": result.AccessToken,
		"user": gin.H{
			"id":            result.User.ID,
			"email":         result.User.Email,
			"walletAddress": result.User.WalletAddress,
			"role":          result.User.Role,
			"specialities":  result.User.Specialities,
		},
	})
}

func (h *AuthHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "OK",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

func (h *AuthHandler) Me(c *gin.Context) {
	user := c.MustGet("user").(*domain.User)
	c.JSON(http.StatusOK, gin.H{
		"id":            user.ID,
		"email":         user.Email,
		"walletAddress": user.WalletAddress,
		"role":          user.Role,
		"specialities":  user.Specialities,
	})
}
