package handler

import (
	"context"
	"database/sql"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type ReviewersAssignedHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *ReviewersAssignedHandler) EventName() string { return "ReviewersAssigned" }

func (h *ReviewersAssignedHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	addrs := parser.AddressSliceArg(event.Args, "reviewers")
	reviewers := make([]string, len(addrs))
	for i, a := range addrs {
		reviewers[i] = a.Hex()
	}
	return h.repo.SetReviewers(ctx, tx, msId, reviewers)
}
