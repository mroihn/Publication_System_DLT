package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/repository"
)

type articleStorage interface {
	UploadFile(data []byte, filename string) (string, error)
}

type ArticleHandler struct {
	reader   repository.ManuscriptReader
	identity *repository.IdentityResolver
	comments *repository.CommentRepository
	storage  articleStorage
}

func NewArticleHandler(reader repository.ManuscriptReader, identity *repository.IdentityResolver, comments *repository.CommentRepository, storage articleStorage) *ArticleHandler {
	return &ArticleHandler{reader: reader, identity: identity, comments: comments, storage: storage}
}

func parseMetadata(metadata string) (title, abstract string) {
	var m struct {
		Title    string `json:"title"`
		Abstract string `json:"abstract"`
	}
	if json.Unmarshal([]byte(metadata), &m) == nil && m.Title != "" {
		return m.Title, m.Abstract
	}
	return "Untitled", ""
}

func atoiDefault(s string, def int) int {
	if v, err := strconv.Atoi(s); err == nil {
		return v
	}
	return def
}

// finalDecisionStatuses are the manuscript statuses at which FR-08 permits
// author identity to be revealed (the review decision is final). Reviewer
// identity is never resolved, even at these statuses: anticipating eventual
// disclosure could still bias a reviewer's verdict while reviewing. Anything
// earlier in the lifecycle (SUBMITTED, CHECKING, PENDING_EDITOR,
// UNDER_REVIEW, REVISION_REQUESTED) must stay anonymized.
var finalDecisionStatuses = map[string]bool{
	"ACCEPTED":  true,
	"REJECTED":  true,
	"PUBLISHED": true,
}

// anonymizedIdentity is the placeholder returned for a participant of a
// manuscript that has not yet reached a final decision: the on-chain
// (burner) address only, with no real wallet or email attached.
func anonymizedIdentity(address string) repository.Identity {
	return repository.Identity{Address: address, RealWallet: address}
}

// List paginates manuscripts and enriches each with the author identity for
// the public article hub. Identity is only resolved to the real wallet/email
// once the manuscript has reached a final decision (FR-08); earlier statuses
// get back the anonymized burner address.
func (h *ArticleHandler) List(c *gin.Context) {
	page := atoiDefault(c.Query("page"), 1)
	limit := atoiDefault(c.Query("limit"), 12)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 12
	}
	status := c.Query("status") // e.g. "PUBLISHED" for the Explore hub; empty = all statuses (Tracker)

	items, err := h.reader.ListManuscriptsPaged(c.Request.Context(), limit, (page-1)*limit, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	total, err := h.reader.CountManuscripts(c.Request.Context(), status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	data := make([]gin.H, len(items))
	for i, m := range items {
		title, abstract := parseMetadata(m.Metadata)
		author := anonymizedIdentity(m.AuthorAddress)
		if finalDecisionStatuses[m.Status] {
			author = h.identity.ResolveAuthor(m.AuthorAddress)
		}
		data[i] = gin.H{
			"ms_id":            m.MsId,
			"title":            title,
			"abstract":         abstract,
			"status":           m.Status,
			"version":          m.Version,
			"cid":              m.CID,
			"author":           author,
			"submit_timestamp": m.SubmitTimestamp,
			"created_at":       m.CreatedAt,
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": data, "page": page, "limit": limit, "total": total})
}

// OpenReview returns the per-version reviewer report. Author identity is only
// resolved to the real wallet/email once the manuscript has reached a final
// decision (FR-08); earlier statuses get back the anonymized burner address.
// Reviewer identity is never resolved, at any status: revealing it even after
// the decision is final would let reviewers anticipate disclosure and bias
// their verdicts, so reviewers stay anonymized permanently.
func (h *ArticleHandler) OpenReview(c *gin.Context) {
	msId, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}
	or, err := h.reader.GetOpenReview(c.Request.Context(), msId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	if or == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "manuscript not found"})
		return
	}

	decided := finalDecisionStatuses[or.Status]
	// Reviewer identity is always anonymized, regardless of decision status.
	resolve := func(addr string) repository.Identity {
		return anonymizedIdentity(addr)
	}

	versions := make([]gin.H, len(or.Versions))
	for i, v := range or.Versions {
		reviewByAddr := map[string]repository.OpenReviewEntry{}
		for _, e := range v.Reviews {
			reviewByAddr[e.ReviewerAddress] = e
		}
		reports := make([]gin.H, len(v.Reviewers))
		for j, addr := range v.Reviewers {
			rep := gin.H{"reviewer": resolve(addr), "status": "pending"}
			if e, ok := reviewByAddr[addr]; ok {
				rep["status"] = e.Verdict // ACCEPT | REJECT | REVISE
				rep["review_cid"] = e.ReviewCid
				rep["tx_hash"] = e.TxHash
			}
			reports[j] = rep
		}
		versions[i] = gin.H{"version": v.Version, "date": v.Date, "reports": reports}
	}

	reviewers := make([]repository.Identity, len(or.Reviewers))
	for i, addr := range or.Reviewers {
		reviewers[i] = resolve(addr)
	}

	author := anonymizedIdentity(or.AuthorAddress)
	if decided {
		author = h.identity.ResolveAuthor(or.AuthorAddress)
	}

	c.JSON(http.StatusOK, gin.H{
		"ms_id":     or.MsId,
		"status":    or.Status,
		"author":    author,
		"versions":  versions,
		"reviewers": reviewers,
	})
}

type prepareCommentRequest struct {
	DOITokenID int64  `json:"doiTokenId"`
	Body       string `json:"body"`
}

// PrepareComment uploads the comment text to IPFS and stores it keyed by the
// on-chain integrity hash (keccak256 of the body); the frontend then calls
// DOIToken.postComment(doiId, hash) with the returned hash.
func (h *ArticleHandler) PrepareComment(c *gin.Context) {
	var req prepareCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		return
	}
	if req.Body == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "comment body is required"})
		return
	}

	hash := crypto.Keccak256Hash([]byte(req.Body)).Hex()
	cid, err := h.storage.UploadFile([]byte(req.Body), fmt.Sprintf("comment-%s.txt", hash[:10]))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "IPFS upload failed: " + err.Error()})
		return
	}
	if err := h.comments.SaveContent(c.Request.Context(), hash, req.DOITokenID, cid, req.Body); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"hash": hash, "cid": cid})
}

// ListComments returns indexed on-chain comments for a published manuscript with
// resolved commenter identities.
func (h *ArticleHandler) ListComments(c *gin.Context) {
	msId, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}
	tokenID, ok, err := h.comments.DOITokenID(c.Request.Context(), msId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	if !ok {
		c.JSON(http.StatusOK, gin.H{"data": []any{}})
		return
	}
	list, err := h.comments.ListForDOI(c.Request.Context(), tokenID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	out := make([]gin.H, len(list))
	for i, cm := range list {
		out[i] = gin.H{
			"commenter": h.identity.ResolveCommenter(cm.CommenterAddress),
			"body":      cm.Body,
			"cid":       cm.CID,
			"tx_hash":   cm.TxHash,
			"posted_at": cm.PostedAt,
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}
