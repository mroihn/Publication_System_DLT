package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type IndexerStatusProvider interface {
	Status(ctx context.Context) interface{}
}

type HealthHandler struct {
	getStatus func(ctx context.Context) any
}

func NewHealthHandler(getStatus func(ctx context.Context) any) *HealthHandler {
	return &HealthHandler{getStatus: getStatus}
}

func (h *HealthHandler) Health(c *gin.Context) {
	resp := gin.H{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	if h.getStatus != nil {
		resp["indexer"] = h.getStatus(c.Request.Context())
	} else {
		resp["indexer"] = gin.H{"status": "disabled"}
	}
	c.JSON(http.StatusOK, resp)
}
