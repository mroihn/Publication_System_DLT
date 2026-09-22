package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/mroihn/ta-proj/backend-go/internal/repository"
)

type JournalHandler struct {
	repo *repository.JournalRepository
}

func NewJournalHandler(repo *repository.JournalRepository) *JournalHandler {
	return &JournalHandler{repo: repo}
}

func (h *JournalHandler) List(c *gin.Context) {
	journals, err := h.repo.ListJournals(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": journals})
}
