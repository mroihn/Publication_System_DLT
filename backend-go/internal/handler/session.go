package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/domain"
	"github.com/mroihn/ta-proj/backend-go/internal/repository"
)

type SessionHandler struct {
	sessionRepo  repository.SessionWalletRepository
	oracleSecret string
}

func NewSessionHandler(sessionRepo repository.SessionWalletRepository, oracleSecret string) *SessionHandler {
	return &SessionHandler{sessionRepo: sessionRepo, oracleSecret: oracleSecret}
}

type createReviewerSessionsRequest struct {
	MsID  uint64 `json:"msId"`
	Field string `json:"field"`
	Count int    `json:"count"` // optional; defaults to 3 (odd ≥ 3 for majority)
}

// CreateReviewerSessions is called by the oracle (guarded by X-Oracle-Secret).
// It selects verified reviewers matching the manuscript's field, mints a burner
// wallet per reviewer, and returns the burner addresses to assign on-chain.
func (h *SessionHandler) CreateReviewerSessions(c *gin.Context) {
	if h.oracleSecret == "" || c.GetHeader("X-Oracle-Secret") != h.oracleSecret {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "invalid oracle secret"})
		return
	}

	var req createReviewerSessionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}
	if req.Field == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "field is required"})
		return
	}
	count := req.Count
	if count <= 0 {
		count = 3
	}

	sessions, err := h.sessionRepo.CreateReviewerSessionsForField(req.MsID, req.Field, count)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	// The contract requires an odd count ≥ 3; surface a clear error if the field
	// doesn't have enough verified reviewers rather than letting the tx revert.
	if len(sessions) < 3 {
		c.JSON(http.StatusConflict, gin.H{
			"message": "not enough verified reviewers for field '" + req.Field + "' (need ≥3 with bound wallets, found " +
				strconv.Itoa(len(sessions)) + ")",
		})
		return
	}

	out := make([]gin.H, len(sessions))
	for i, s := range sessions {
		out[i] = gin.H{"mainAddress": s.MainAddress, "sessionAddress": s.SessionAddress}
	}
	c.JSON(http.StatusOK, gin.H{"sessions": out})
}

// GetAssignments returns the logged-in reviewer's burner session wallets
// (address + private key) so the frontend can sign reviews with them.
func (h *SessionHandler) GetAssignments(c *gin.Context) {
	user := c.MustGet("user").(*domain.User)
	views, err := h.sessionRepo.GetReviewerSessionsForUser(user.ID, user.WalletAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": views})
}
