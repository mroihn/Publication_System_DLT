package main

import (
	"context"
	"errors"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/config"
	dbpkg "github.com/mroihn/ta-proj/backend-go/internal/db"
	"github.com/mroihn/ta-proj/backend-go/internal/handler"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/blockchain"
	idxhandler "github.com/mroihn/ta-proj/backend-go/internal/indexer/handler"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/middleware"
	"github.com/mroihn/ta-proj/backend-go/internal/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/service"
	"github.com/mroihn/ta-proj/backend-go/internal/usecase"
)

func main() {
	cfg := config.Load()

	// Database
	db, err := dbpkg.Open(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := dbpkg.RunMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Infrastructure
	userRepo := repository.NewPostgresUserRepository(db)
	msReader := repository.NewPostgresManuscriptReader(db)
	pinata := service.NewPinataService(cfg.PinataJWT)
	ethereum := service.NewEthereumService(cfg.RPCURL, cfg.OperatorPrivateKey, cfg.RegistryContractAddress)

	// Use cases
	authUC := usecase.NewAuthUseCase(userRepo, cfg.JWTSecret)
	manuscriptUC := usecase.NewManuscriptUseCase(pinata, ethereum, msReader)
	userUC := usecase.NewUserUseCase(userRepo)

	// HTTP handlers
	authHandler := handler.NewAuthHandler(authUC)
	manuscriptHandler := handler.NewManuscriptHandler(manuscriptUC)
	userHandler := handler.NewUserHandler(userUC)

	// Indexer (disabled if no registry address configured)
	var idx *indexer.Indexer
	if cfg.RegistryContractAddress != "" &&
		cfg.RegistryContractAddress != "0x0000000000000000000000000000000000000000" {

		rpcURL := firstOf(cfg.IndexerRPCWSS, cfg.RPCURL)
		ethClient, err := blockchain.NewEthClientAdapter(rpcURL)
		if err != nil {
			log.Printf("Indexer: failed to connect to RPC (%s): %v — indexer disabled", rpcURL, err)
		} else {
			evtParser, err := parser.NewMultiContractParser(
				cfg.RegistryContractAddress,
				cfg.ReviewOracleContractAddress,
				cfg.DOITokenContractAddress,
			)
			if err != nil {
				log.Printf("Indexer: failed to parse ABIs: %v — indexer disabled", err)
				ethClient.Close()
			} else {
				repo := idxrepo.NewPostgresIndexerRepository(db)
				handlers := idxhandler.BuildHandlerMap(repo, ethClient)
				idx = indexer.New(ethClient, evtParser, handlers, repo, db, indexer.Config{
					RegistryAddress: cfg.RegistryContractAddress,
					OracleAddress:   cfg.ReviewOracleContractAddress,
					DOITokenAddress: cfg.DOITokenContractAddress,
					StartBlock:      cfg.IndexerStartBlock,
					PollIntervalMs:  cfg.IndexerPollIntervalMs,
					UseWebSocket:    cfg.IndexerRPCWSS != "",
				})

				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				go func() {
					if err := idx.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
						log.Printf("Indexer stopped: %v", err)
					}
				}()
			}
		}
	}

	var getIndexerStatus func(ctx context.Context) any
	if idx != nil {
		getIndexerStatus = func(ctx context.Context) any { return idx.Status(ctx) }
	}
	healthHandler := handler.NewHealthHandler(getIndexerStatus)

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
		v1.GET("/health", healthHandler.Health)

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
			manuscripts.GET("", manuscriptHandler.List)
			manuscripts.GET("/:id", manuscriptHandler.GetByID)
			manuscripts.POST("/upload/file", manuscriptHandler.UploadFile)
			manuscripts.POST("/submit", manuscriptHandler.Submit)
			manuscripts.POST("/:id/reviews", manuscriptHandler.SubmitReview)
		}
	}

	addr := "0.0.0.0:" + cfg.Port
	log.Printf("Server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func firstOf(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
