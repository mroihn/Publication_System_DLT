package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/domain"
	"github.com/mroihn/ta-proj/backend-go/internal/repository"
)

type editorContract interface {
	SubmitEditorReview(msId uint64, approve bool, field, editorCid string) (string, error)
	VerifyReviewerFields(reviewerAddr string, fields []string) (string, error)
}

type editorStorage interface {
	UploadFile(data []byte, filename string) (string, error)
}

var allowedFields = map[string]bool{
	"ai":                true,
	"computer-security": true,
	"blockchain":        true,
	"cloud-computing":   true,
	"data-science":      true,
}

type EditorHandler struct {
	repo     repository.EditorRepository
	contract editorContract
	storage  editorStorage
}

func NewEditorHandler(repo repository.EditorRepository, contract editorContract, storage editorStorage) *EditorHandler {
	return &EditorHandler{repo: repo, contract: contract, storage: storage}
}

func requireEditor(c *gin.Context) (*domain.User, bool) {
	user := c.MustGet("user").(*domain.User)
	if user.Role != "editor" {
		c.JSON(http.StatusForbidden, gin.H{"message": "editor role required"})
		return nil, false
	}
	return user, true
}

func (h *EditorHandler) ListReviewerVerifications(c *gin.Context) {
	if _, ok := requireEditor(c); !ok {
		return
	}
	list, err := h.repo.ListPendingFieldRequests()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": list})
}

type verificationDecisionRequest struct {
	Approve bool `json:"approve"`
}

func (h *EditorHandler) DecideReviewerVerification(c *gin.Context) {
	editor, ok := requireEditor(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}
	var req verificationDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}

	fr, err := h.repo.GetFieldRequest(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	if fr == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "verification request not found"})
		return
	}
	if fr.Status != "pending" {
		c.JSON(http.StatusConflict, gin.H{"message": "request already " + fr.Status})
		return
	}

	if !req.Approve {
		if err := h.repo.RejectFieldRequest(id, editor.ID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "rejected"})
		return
	}

	if fr.WalletAddress == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "reviewer must bind a wallet before approval"})
		return
	}

	txHash, err := h.contract.VerifyReviewerFields(fr.WalletAddress, fr.Fields)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "on-chain verification failed: " + err.Error()})
		return
	}
	if err := h.repo.MarkFieldRequestApproved(id, editor.ID, fr.Fields); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "approved", "tx_hash": txHash, "fields": fr.Fields})
}

type reviewerFieldsRequest struct {
	Fields []string `json:"fields"`
}

func (h *EditorHandler) GetReviewerSpecialization(c *gin.Context) {
	user := c.MustGet("user").(*domain.User)
	if user.Role != "reviewer" && user.Role != "user" {
		c.JSON(http.StatusForbidden, gin.H{"message": "reviewer role required"})
		return
	}
	req, err := h.repo.GetLatestFieldRequestForUser(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"verified_fields": user.VerifiedFields,
		"wallet_address":  user.WalletAddress,
		"request":         req,
	})
}

func (h *EditorHandler) SubmitReviewerFields(c *gin.Context) {
	user := c.MustGet("user").(*domain.User)
	if user.Role != "reviewer" && user.Role != "user" {
		c.JSON(http.StatusForbidden, gin.H{"message": "reviewer role required"})
		return
	}
	var req reviewerFieldsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}
	cleaned := []string{}
	seen := map[string]bool{}
	for _, f := range req.Fields {
		if !allowedFields[f] || seen[f] {
			continue
		}
		seen[f] = true
		cleaned = append(cleaned, f)
	}
	if len(cleaned) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "at least one valid field is required"})
		return
	}
	if err := h.repo.CreatePendingFieldRequest(user.ID, cleaned); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "pending", "fields": cleaned})
}

func (h *EditorHandler) ListPendingManuscripts(c *gin.Context) {
	editor, ok := requireEditor(c)
	if !ok {
		return
	}
	list, err := h.repo.ListManuscriptsByStatus("PENDING_EDITOR", editor.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": list})
}

type editorReviewRequest struct {
	Approve bool   `json:"approve"`
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (h *EditorHandler) ReviewManuscript(c *gin.Context) {
	editor, ok := requireEditor(c)
	if !ok {
		return
	}
	msId, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid manuscript id"})
		return
	}
	assignedTo, found, err := h.repo.GetManuscriptAssignment(msId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"message": "manuscript not found"})
		return
	}
	// Unassigned manuscripts stay open to any editor; an assigned one belongs to its editor.
	if assignedTo != nil && *assignedTo != editor.ID {
		c.JSON(http.StatusForbidden, gin.H{"message": "manuscript is assigned to another editor"})
		return
	}
	var req editorReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}
	if req.Approve && !allowedFields[req.Field] {
		c.JSON(http.StatusBadRequest, gin.H{"message": "a valid field is required to approve"})
		return
	}

	payload, _ := json.Marshal(map[string]any{
		"approve": req.Approve, "field": req.Field, "message": req.Message,
	})
	editorCid, err := h.storage.UploadFile(payload, fmt.Sprintf("editor-ms%d.json", msId))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "upload editor decision to IPFS: " + err.Error()})
		return
	}

	txHash, err := h.contract.SubmitEditorReview(msId, req.Approve, req.Field, editorCid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	status := "REJECTED"
	if req.Approve {
		status = "UNDER_REVIEW"
	}
	c.JSON(http.StatusOK, gin.H{"tx_hash": txHash, "status": status, "editor_cid": editorCid})
}
