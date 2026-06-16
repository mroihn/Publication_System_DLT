package handler

import (
	"context"
	"database/sql"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type PlagiarismFulfilledHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *PlagiarismFulfilledHandler) EventName() string { return "PlagiarismCheckFulfilled" }

func (h *PlagiarismFulfilledHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	requestId := parser.BigIntArg(event.Args, "requestId").Uint64()
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	score := parser.BigIntArg(event.Args, "score").Uint64()
	return h.repo.FulfillPlagiarismRequest(ctx, tx, requestId, msId, score)
}
