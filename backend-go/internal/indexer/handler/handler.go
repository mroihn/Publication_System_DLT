package handler

import (
	"context"
	"database/sql"

	"github.com/mroihn/ta-proj/backend-go/internal/indexer/blockchain"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
)

type EventHandler interface {
	EventName() string
	Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error
}

func BuildHandlerMap(repo idxrepo.IndexerRepository, client blockchain.BlockchainClient, registryAddress string) map[string]EventHandler {
	handlers := []EventHandler{
		&ManuscriptSubmittedHandler{repo: repo, client: client, registryAddress: registryAddress},
		&DecisionMadeHandler{repo: repo},
		&ReviewSubmittedHandler{repo: repo},
		&ReviewersAssignedHandler{repo: repo},
		&ManuscriptRevisedHandler{repo: repo},
		&DOIMintedHandler{repo: repo},
		&DOIRegisteredHandler{repo: repo},
		&EditorReviewedHandler{repo: repo},
		&IncentivePaidHandler{repo: repo},
		&PlagiarismRequestedHandler{repo: repo},
		&PlagiarismFulfilledHandler{repo: repo},
		&ReviewerSelectionRequestedHandler{repo: repo},
		&ReviewerSelectionFulfilledHandler{repo: repo},
		&CommentPostedHandler{repo: repo},
	}
	m := make(map[string]EventHandler, len(handlers))
	for _, h := range handlers {
		m[h.EventName()] = h
	}
	return m
}
