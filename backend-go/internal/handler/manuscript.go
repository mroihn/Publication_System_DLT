package handler

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/usecase"
)

type ManuscriptHandler struct {
	manuscriptUC *usecase.ManuscriptUseCase
}

func NewManuscriptHandler(manuscriptUC *usecase.ManuscriptUseCase) *ManuscriptHandler {
	return &ManuscriptHandler{manuscriptUC: manuscriptUC}
}

func (h *ManuscriptHandler) Upload(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "file is required"})
		return
	}
	defer file.Close()

	title := c.PostForm("title")
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "title is required"})
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to read file"})
		return
	}

	result, err := h.manuscriptUC.Submit(data, header.Filename, title)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}
