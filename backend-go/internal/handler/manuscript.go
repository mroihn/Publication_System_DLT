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
	CID       string `json:"cid"`
	Title     string `json:"title"`
	Signature string `json:"signature"` // 0x-prefixed 65-byte hex from MetaMask
	Nonce     string `json:"nonce"`     // uint256 as decimal string (BigInt from JS)
}

// Submit submits a signed manuscript to the smart contract.
// Step 2 of the two-step EIP-712 submit flow.
func (h *ManuscriptHandler) Submit(c *gin.Context) {
	var req submitManuscriptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}
	if req.CID == "" || req.Title == "" || req.Signature == "" || req.Nonce == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "cid, title, signature, and nonce are required"})
		return
	}

	nonce, err := strconv.ParseUint(req.Nonce, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid nonce: must be a decimal integer"})
		return
	}

	result, err := h.manuscriptUC.SubmitOnChain(req.CID, req.Title, req.Signature, nonce)
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
