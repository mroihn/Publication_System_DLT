package handler

import (
	"context"
	"database/sql"
	"log"
	"time"

	"github.com/mroihn/ta-proj/backend-go/internal/indexer/blockchain"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
)

type ManuscriptSubmittedHandler struct {
	repo   idxrepo.IndexerRepository
	client blockchain.BlockchainClient
}

func (h *ManuscriptSubmittedHandler) EventName() string { return "ManuscriptSubmitted" }

func (h *ManuscriptSubmittedHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	cid := parser.StringArg(event.Args, "cid")
	author := parser.AddressArg(event.Args, "author").Hex()

	var submittedAt *time.Time
	header, err := h.client.HeaderByHash(ctx, event.Raw.BlockHash)
	if err != nil {
		log.Printf("ManuscriptSubmitted: could not fetch block header for hash %s (msId=%d): %v — timestamp will be null",
			event.Raw.BlockHash.Hex(), msId, err)
	} else {
		t := time.Unix(int64(header.Time), 0).UTC()
		submittedAt = &t
	}

	return h.repo.UpsertManuscript(ctx, tx, idxrepo.ManuscriptRow{
		MsId:          msId,
		AuthorAddress: author,
		CID:           cid,
		Status:        "CHECKING",
		Version:       1,
		TxHash:        event.Raw.TxHash.Hex(),
		BlockNumber:   event.Raw.BlockNumber,
		SubmittedAt:   submittedAt,
	})
}
