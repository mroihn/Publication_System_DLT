package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type RPCPinger interface {
	BlockNumber(ctx context.Context) (uint64, error)
}

type HealthHandler struct {
	client RPCPinger
}

func NewHealthHandler(client RPCPinger) *HealthHandler {
	return &HealthHandler{client: client}
}

func (h *HealthHandler) Health(c *gin.Context) {
	resp := gin.H{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	if h.client == nil {
		resp["rpc"] = gin.H{"status": "disabled"}
	} else {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		if blockNumber, err := h.client.BlockNumber(ctx); err != nil {
			resp["rpc"] = gin.H{"status": "unreachable", "error": err.Error()}
		} else {
			resp["rpc"] = gin.H{"status": "ok", "block_number": blockNumber}
		}
	}
	c.JSON(http.StatusOK, resp)
}
