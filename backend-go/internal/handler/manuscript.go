package handler

import (
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/usecase"
)

type ManuscriptHandler struct {
	manuscriptUC *usecase.ManuscriptUseCase
}

func NewManuscriptHandler(manuscriptUC *usecase.ManuscriptUseCase) *ManuscriptHandler {
	return &ManuscriptHandler{manuscriptUC: manuscriptUC}
}

func (h *ManuscriptHandler) List(c *gin.Context) {
	list, err := h.manuscriptUC.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": list})
}

func (h *ManuscriptHandler) GetByID(c *gin.Context) {
	msId, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}
	detail, err := h.manuscriptUC.GetByID(c.Request.Context(), msId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	if detail == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "manuscript not found"})
		return
	}
	c.JSON(http.StatusOK, detail)
}

type submitReviewRequest struct {
	Verdict  int    `json:"verdict"`
	Comments string `json:"comments"`
}

func (h *ManuscriptHandler) SubmitReview(c *gin.Context) {
	msId, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid manuscript id"})
		return
	}

	var req submitReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}
	if req.Verdict < 0 || req.Verdict > 2 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "verdict must be 0 (ACCEPT), 1 (REJECT), or 2 (REVISE)"})
		return
	}
	if req.Comments == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "comments are required"})
		return
	}

	txHash, err := h.manuscriptUC.SubmitReview(msId, req.Comments, uint8(req.Verdict))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tx_hash": txHash})
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
