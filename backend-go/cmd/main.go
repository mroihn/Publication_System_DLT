package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/config"
	"github.com/mroihn/ta-proj/backend-go/internal/handler"
	"github.com/mroihn/ta-proj/backend-go/internal/middleware"
	"github.com/mroihn/ta-proj/backend-go/internal/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/service"
	"github.com/mroihn/ta-proj/backend-go/internal/usecase"
)

func main() {
	cfg := config.Load()

	// Infrastructure
	userRepo := repository.NewInMemoryUserRepository()
	pinata := service.NewPinataService(cfg.PinataJWT)
	ethereum := service.NewEthereumService(cfg.RPCURL, cfg.OperatorPrivateKey, cfg.RegistryContractAddress)

	// Use cases
	authUC := usecase.NewAuthUseCase(userRepo, cfg.JWTSecret)
	manuscriptUC := usecase.NewManuscriptUseCase(pinata, ethereum)
	userUC := usecase.NewUserUseCase(userRepo)

	// Handlers
	authHandler := handler.NewAuthHandler(authUC)
	manuscriptHandler := handler.NewManuscriptHandler(manuscriptUC)
	userHandler := handler.NewUserHandler(userUC)

	// Router
	r := gin.Default()
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	v1 := r.Group("/api/v1")
	{
		v1.GET("/health", authHandler.Health)

		auth := v1.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/logout", authHandler.Logout)
		}

		jwtMW := middleware.JWTAuth(userRepo, cfg.JWTSecret)

		users := v1.Group("/users")
		{
			users.GET("/me", jwtMW, authHandler.Me)
			users.PATCH("/wallet-bind", jwtMW, userHandler.BindWallet)
		}

		manuscripts := v1.Group("/manuscripts")
		{
			manuscripts.POST("/upload", manuscriptHandler.Upload)
		}
	}

	addr := "0.0.0.0:" + cfg.Port
	log.Printf("Server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
