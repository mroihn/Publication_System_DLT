package handler

import (
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/domain"
	"github.com/mroihn/ta-proj/backend-go/internal/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/usecase"
)

type ManuscriptHandler struct {
	manuscriptUC *usecase.ManuscriptUseCase
	sessionRepo  repository.SessionWalletRepository
}

func NewManuscriptHandler(manuscriptUC *usecase.ManuscriptUseCase, sessionRepo repository.SessionWalletRepository) *ManuscriptHandler {
	return &ManuscriptHandler{manuscriptUC: manuscriptUC, sessionRepo: sessionRepo}
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

// UploadFile uploads a manuscript file to IPFS and returns the CID.
// Step 1 of the two-step EIP-712 submit flow.
func (h *ManuscriptHandler) UploadFile(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "file is required"})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to read file"})
		return
	}

	cid, err := h.manuscriptUC.UploadFile(data, header.Filename)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"cid": cid})
}

type submitManuscriptRequest struct {
	CID               string `json:"cid"`
	Metadata          string `json:"metadata"`          // exact JSON string that was EIP-712 signed
	Signature         string `json:"signature"`         // 0x-prefixed 65-byte hex from the SubmissionWallet
	Nonce             string `json:"nonce"`             // uint256 as decimal string (BigInt from JS)
	SubmissionAddress string `json:"submissionAddress"` // burner SubmissionWallet public address
}

// Submit relays a signed manuscript to the smart contract and records the
// off-chain UserID ↔ SubmissionWallet mapping for the double-blind flow.
func (h *ManuscriptHandler) Submit(c *gin.Context) {
	user := c.MustGet("user").(*domain.User)

	var req submitManuscriptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}
	if req.CID == "" || req.Metadata == "" || req.Signature == "" || req.Nonce == "" || req.SubmissionAddress == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "cid, metadata, signature, nonce, and submissionAddress are required"})
		return
	}

	nonce, err := strconv.ParseUint(req.Nonce, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid nonce: must be a decimal integer"})
		return
	}

	result, err := h.manuscriptUC.SubmitOnChain(req.CID, req.Metadata, req.Signature, nonce)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	// Record the anonymous author mapping (best-effort; the on-chain tx already succeeded).
	if err := h.sessionRepo.SaveSubmissionWallet(user.ID, req.SubmissionAddress); err != nil {
		c.JSON(http.StatusOK, gin.H{"cid": result.CID, "txHash": result.TxHash, "status": result.Status,
			"warning": "submitted on-chain but failed to persist submission wallet mapping: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

type reviseManuscriptRequest struct {
	NewCID    string `json:"newCid"`    // CID of the newly uploaded revision, IPFS
	Signature string `json:"signature"` // 0x-prefixed 65-byte hex from the original SubmissionWallet
	Nonce     string `json:"nonce"`     // uint256 as decimal string (BigInt from JS)
}

// Revise relays a signed manuscript revision to the smart contract. No new
// wallet mapping is recorded — the author burner address is already on file
// from the original submission.
func (h *ManuscriptHandler) Revise(c *gin.Context) {
	msId, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid manuscript id"})
		return
	}

	var req reviseManuscriptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}
	if req.NewCID == "" || req.Signature == "" || req.Nonce == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "newCid, signature, and nonce are required"})
		return
	}

	nonce, err := strconv.ParseUint(req.Nonce, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid nonce: must be a decimal integer"})
		return
	}

	result, err := h.manuscriptUC.ReviseOnChain(msId, req.NewCID, req.Signature, nonce)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

type submitReviewRequest struct {
	Verdict   int    `json:"verdict"`
	Comments  string `json:"comments"`
	Signature string `json:"signature"` // 0x-prefixed 65-byte hex from MetaMask
	Nonce     string `json:"nonce"`     // uint256 as decimal string
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
	if req.Signature == "" || req.Nonce == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "signature and nonce are required"})
		return
	}

	nonce, err := strconv.ParseUint(req.Nonce, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid nonce: must be a decimal integer"})
		return
	}

	txHash, err := h.manuscriptUC.SubmitReview(msId, req.Comments, req.Signature, nonce, uint8(req.Verdict))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tx_hash": txHash})
}
