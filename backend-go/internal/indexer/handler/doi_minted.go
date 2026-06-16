package handler

import (
	"context"
	"database/sql"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type DOIMintedHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *DOIMintedHandler) EventName() string { return "DOIMinted" }

func (h *DOIMintedHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	doiTokenId := parser.BigIntArg(event.Args, "doiTokenId").Uint64()
	// DOIRegistered carries the doi string; here we only record the token ID.
	return h.repo.UpdateManuscriptDOI(ctx, tx, msId, "", doiTokenId)
}
