package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/domain"
	"github.com/mroihn/ta-proj/backend-go/internal/usecase"
)

type UserHandler struct {
	userUC *usecase.UserUseCase
}

func NewUserHandler(userUC *usecase.UserUseCase) *UserHandler {
	return &UserHandler{userUC: userUC}
}

func (h *UserHandler) BindWallet(c *gin.Context) {
	user := c.MustGet("user").(*domain.User)

	var body struct {
		WalletAddress string `json:"walletAddress" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}

	if err := h.userUC.BindWallet(user.ID, body.WalletAddress); err != nil {
		status := http.StatusBadRequest
		if err.Error() == "wallet address is already bound to another account" {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Wallet successfully linked."})
}

func (h *UserHandler) VerifyIdentity(c *gin.Context) {
	user := c.MustGet("user").(*domain.User)

	var body struct {
		IDToken string `json:"idToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}

	email, err := h.userUC.VerifyIdentity(c.Request.Context(), user.ID, body.IDToken)
	if err != nil {
		status := http.StatusBadRequest
		if err.Error() == "this account is already verified by another user" {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Identity verified.", "identityEmail": email})
}
