package handler

import (
	"net/http"

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
	MsID      uint64                           `json:"msId"`
	Reviewers []repository.ReviewerSessionSeed `json:"reviewers"`
}

// CreateReviewerSessions is called by the oracle (guarded by X-Oracle-Secret).
// It mints one burner wallet per selected reviewer and returns the burner
// addresses in the same order so the oracle can submit them on-chain.
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
	if req.MsID == 0 || len(req.Reviewers) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "msId and reviewers are required"})
		return
	}

	sessions, err := h.sessionRepo.CreateReviewerSessions(req.MsID, req.Reviewers)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
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
