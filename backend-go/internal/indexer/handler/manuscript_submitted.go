package handler

import (
	"context"
	"database/sql"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type ManuscriptSubmittedHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *ManuscriptSubmittedHandler) EventName() string { return "ManuscriptSubmitted" }

func (h *ManuscriptSubmittedHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	cid := parser.StringArg(event.Args, "cid")
	return h.repo.UpsertManuscript(ctx, tx, idxrepo.ManuscriptRow{
		MsId:        msId,
		CID:         cid,
		Status:      "CHECKING",
		Version:     1,
		TxHash:      event.Raw.TxHash.Hex(),
		BlockNumber: event.Raw.BlockNumber,
	})
}
