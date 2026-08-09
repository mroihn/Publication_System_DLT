package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/domain"
)

// RequireRole must run after JWTAuth (which sets "user" in the gin context).
// It 403s any request from a user whose role isn't in the allowed set.
func RequireRole(roles ...string) gin.HandlerFunc {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(c *gin.Context) {
		user, ok := c.MustGet("user").(*domain.User)
		if !ok || !allowed[user.Role] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"message": "insufficient permissions"})
			return
		}
		c.Next()
	}
}
