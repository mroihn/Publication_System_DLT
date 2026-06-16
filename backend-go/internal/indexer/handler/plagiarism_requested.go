package handler

import (
	"context"
	"database/sql"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type PlagiarismRequestedHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *PlagiarismRequestedHandler) EventName() string { return "PlagiarismCheckRequested" }

func (h *PlagiarismRequestedHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	requestId := parser.BigIntArg(event.Args, "requestId").Uint64()
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	cid := parser.StringArg(event.Args, "cid")
	return h.repo.InsertPlagiarismRequest(ctx, tx, requestId, msId, cid)
}
