// replay truncates all projection tables and re-indexes from the configured start block.
// Usage: go run ./cmd/replay/main.go
package main

import (
	"context"
	"log"

	"github.com/mroihn/ta-proj/backend-go/internal/config"
	dbpkg "github.com/mroihn/ta-proj/backend-go/internal/db"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/blockchain"
	idxhandler "github.com/mroihn/ta-proj/backend-go/internal/indexer/handler"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
)

func main() {
	cfg := config.Load()

	db, err := dbpkg.Open(cfg)
	if err != nil {
		log.Fatalf("DB open: %v", err)
	}
	defer db.Close()

	if err := dbpkg.RunMigrations(db); err != nil {
		log.Fatalf("Migrations: %v", err)
	}

	log.Println("Replay: truncating projection tables")
	_, err = db.Exec(`
		TRUNCATE TABLE doi_comments, incentive_payments, manuscript_revisions,
		               reviews, manuscript_reviewers, plagiarism_requests,
		               manuscripts, processed_events, indexer_checkpoints
		RESTART IDENTITY CASCADE
	`)
	if err != nil {
		log.Fatalf("Truncate: %v", err)
	}

	rpcURL := firstOf(cfg.IndexerRPCWSS, cfg.RPCURL)
	ethClient, err := blockchain.NewEthClientAdapter(rpcURL)
	if err != nil {
		log.Fatalf("RPC connect: %v", err)
	}
	defer ethClient.Close()

	evtParser, err := parser.NewMultiContractParser(
		cfg.RegistryContractAddress,
		cfg.ReviewOracleContractAddress,
		cfg.DOITokenContractAddress,
	)
	if err != nil {
		log.Fatalf("Parser: %v", err)
	}

	repo := idxrepo.NewPostgresIndexerRepository(db)
	handlers := idxhandler.BuildHandlerMap(repo, ethClient)
	idx := indexer.New(ethClient, evtParser, handlers, repo, db, indexer.Config{
		RegistryAddress: cfg.RegistryContractAddress,
		OracleAddress:   cfg.ReviewOracleContractAddress,
		DOITokenAddress: cfg.DOITokenContractAddress,
		StartBlock:      cfg.IndexerStartBlock,
		PollIntervalMs:  cfg.IndexerPollIntervalMs,
		UseWebSocket:    false, // replay always uses FilterLogs, not subscribe
	})

	log.Printf("Replay: indexing from block %d", cfg.IndexerStartBlock)
	if err := idx.RunHistoricalOnly(context.Background()); err != nil {
		log.Fatalf("Replay failed: %v", err)
	}
	log.Println("Replay: complete")
}

func firstOf(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
