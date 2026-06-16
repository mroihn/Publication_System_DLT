package handler

import (
	"context"
	"database/sql"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type EventHandler interface {
	EventName() string
	Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error
}

func BuildHandlerMap(repo idxrepo.IndexerRepository) map[string]EventHandler {
	handlers := []EventHandler{
		&ManuscriptSubmittedHandler{repo: repo},
		&DecisionMadeHandler{repo: repo},
		&ReviewSubmittedHandler{repo: repo},
		&ReviewersAssignedHandler{repo: repo},
		&ManuscriptRevisedHandler{repo: repo},
		&DOIMintedHandler{repo: repo},
		&DOIRegisteredHandler{repo: repo},
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
