package handler

import (
	"context"
	"database/sql"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type ReviewerSelectionFulfilledHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *ReviewerSelectionFulfilledHandler) EventName() string { return "ReviewerSelectionFulfilled" }

func (h *ReviewerSelectionFulfilledHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	// ReviewersAssigned on the registry side carries the same data.
	// This oracle-side event is recorded for audit only.
	_ = parser.BigIntArg(event.Args, "requestId")
	_ = parser.BigIntArg(event.Args, "msId")
	_ = parser.AddressSliceArg(event.Args, "reviewers")
	return nil
}
