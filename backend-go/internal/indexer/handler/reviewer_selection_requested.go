package handler

import (
	"context"
	"database/sql"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type ReviewerSelectionRequestedHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *ReviewerSelectionRequestedHandler) EventName() string { return "ReviewerSelectionRequested" }

func (h *ReviewerSelectionRequestedHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	// No projection update needed for this event — it is an oracle request signal.
	// We record it via processed_events (handled by the indexer loop) for audit.
	_ = parser.BigIntArg(event.Args, "requestId")
	_ = parser.BigIntArg(event.Args, "msId")
	return nil
}
