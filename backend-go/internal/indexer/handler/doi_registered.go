package handler

import (
	"context"
	"database/sql"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type DOIRegisteredHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *DOIRegisteredHandler) EventName() string { return "DOIRegistered" }

func (h *DOIRegisteredHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	doi := parser.StringArg(event.Args, "doi")
	doiTokenId := parser.BigIntArg(event.Args, "doiTokenId").Uint64()
	return h.repo.UpdateManuscriptDOI(ctx, tx, msId, doi, doiTokenId)
}
