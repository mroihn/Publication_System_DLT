package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/mroihn/ta-proj/backend-go/internal/chainquery"
	"github.com/mroihn/ta-proj/backend-go/internal/config"
	dbpkg "github.com/mroihn/ta-proj/backend-go/internal/db"
	"github.com/mroihn/ta-proj/backend-go/internal/handler"
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

	// On-chain reader: every read of contract state (manuscripts, reviews,
	// comments, ...) goes straight to the chain, per request — no off-chain
	// mirror. Reader construction fails fast if the RPC or ABIs are bad,
	// since without it most of the API can't serve reads at all.
	chainClient, err := chainquery.NewEthClientAdapter(cfg.RPCURL)
	if err != nil {
		log.Fatalf("Failed to connect to RPC (%s): %v", cfg.RPCURL, err)
	}
	registryReader, err := chainquery.NewRegistryReader(chainClient, cfg.RegistryContractAddress, cfg.RegistryDeployBlock)
	if err != nil {
		log.Fatalf("Failed to build registry reader: %v", err)
	}
	oracleReader, err := chainquery.NewOracleReader(chainClient, cfg.ReviewOracleContractAddress, cfg.RegistryDeployBlock)
	if err != nil {
		log.Fatalf("Failed to build oracle reader: %v", err)
	}
	doiTokenReader, err := chainquery.NewDOITokenReader(chainClient, cfg.DOITokenContractAddress, cfg.RegistryDeployBlock)
	if err != nil {
		log.Fatalf("Failed to build DOI token reader: %v", err)
	}

	// Infrastructure
	userRepo := repository.NewPostgresUserRepository(db)
	msReader := repository.NewChainManuscriptReader(registryReader, oracleReader)
	sessionRepo := repository.NewPostgresSessionWalletRepository(db, userRepo, registryReader)
	editorRepo := repository.NewPostgresEditorRepository(db, registryReader)
	identityResolver := repository.NewIdentityResolver(db)
	commentRepo := repository.NewCommentRepository(db, registryReader, doiTokenReader)
	pinata := service.NewPinataService(cfg.PinataJWT)
	ethereum := service.NewEthereumService(cfg.RPCURL, cfg.OperatorPrivateKey, cfg.RegistryContractAddress)

	// Use cases
	authUC := usecase.NewAuthUseCase(userRepo, cfg.JWTSecret)
	manuscriptUC := usecase.NewManuscriptUseCase(pinata, ethereum, msReader)
	userUC := usecase.NewUserUseCase(userRepo, service.GoogleIdentityVerifier{}, cfg.GoogleClientID)

	// HTTP handlers
	authHandler := handler.NewAuthHandler(authUC, editorRepo)
	manuscriptHandler := handler.NewManuscriptHandler(manuscriptUC, sessionRepo)
	sessionHandler := handler.NewSessionHandler(sessionRepo, cfg.OracleSharedSecret)
	editorHandler := handler.NewEditorHandler(editorRepo, ethereum, pinata)
	articleHandler := handler.NewArticleHandler(msReader, identityResolver, commentRepo, pinata)
	userHandler := handler.NewUserHandler(userUC)
	healthHandler := handler.NewHealthHandler(chainClient)

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
			users.PATCH("/identity-verify", jwtMW, userHandler.VerifyIdentity)
		}

		manuscripts := v1.Group("/manuscripts")
		{
			manuscripts.GET("", articleHandler.List)
			manuscripts.GET("/:id", manuscriptHandler.GetByID)
			manuscripts.GET("/:id/open-review", articleHandler.OpenReview)
			manuscripts.GET("/:id/comments", articleHandler.ListComments)
			manuscripts.POST("/upload/file", manuscriptHandler.UploadFile)
			manuscripts.POST("/submit", jwtMW, manuscriptHandler.Submit)
			manuscripts.POST("/:id/revise", jwtMW, manuscriptHandler.Revise)
			manuscripts.POST("/:id/reviews", jwtMW, middleware.RequireRole("reviewer"), manuscriptHandler.SubmitReview)
		}

		v1.POST("/comments/prepare", jwtMW, articleHandler.PrepareComment)

		// Oracle → backend: mint reviewer burner wallets (shared-secret guarded).
		v1.POST("/internal/reviewer-sessions", sessionHandler.CreateReviewerSessions)

		requireReviewer := middleware.RequireRole("reviewer")
		requireReviewerOrUser := middleware.RequireRole("reviewer", "user")
		// Reviewer fetches their burner session wallets to sign reviews.
		v1.GET("/reviewer/assignments", jwtMW, requireReviewer, sessionHandler.GetAssignments)
		// Reviewer views + (re)submits specialization fields for editor verification;
		// a plain user may also apply here to become a reviewer.
		v1.GET("/reviewer/specialization", jwtMW, requireReviewerOrUser, editorHandler.GetReviewerSpecialization)
		v1.POST("/reviewer/specialization", jwtMW, requireReviewerOrUser, editorHandler.SubmitReviewerFields)

		// Editor: reviewer specialization verification + manuscript screening.
		editor := v1.Group("/editor", jwtMW, middleware.RequireRole("editor"))
		{
			editor.GET("/reviewer-verifications", editorHandler.ListReviewerVerifications)
			editor.POST("/reviewer-verifications/:id/decision", editorHandler.DecideReviewerVerification)
			editor.GET("/manuscripts", editorHandler.ListPendingManuscripts)
			editor.POST("/manuscripts/:id/review", editorHandler.ReviewManuscript)
		}
	}

	addr := "0.0.0.0:" + cfg.Port
	log.Printf("Server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
