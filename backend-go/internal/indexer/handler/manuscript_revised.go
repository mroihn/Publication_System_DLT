package handler

import (
	"context"
	"database/sql"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type ManuscriptRevisedHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *ManuscriptRevisedHandler) EventName() string { return "ManuscriptRevised" }

func (h *ManuscriptRevisedHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	newCid := parser.StringArg(event.Args, "newCid")
	version := parser.BigIntArg(event.Args, "version").Uint64()

	if err := h.repo.UpdateManuscriptCID(ctx, tx, msId, newCid, version); err != nil {
		return err
	}
	return h.repo.InsertRevision(ctx, tx, idxrepo.RevisionRow{
		MsId:        msId,
		NewCid:      newCid,
		Version:     version,
		TxHash:      event.Raw.TxHash.Hex(),
		BlockNumber: event.Raw.BlockNumber,
	})
}
