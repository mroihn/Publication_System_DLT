package handler

import (
	"context"
	"database/sql"
	"encoding/hex"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type CommentPostedHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *CommentPostedHandler) EventName() string { return "CommentPosted" }

func (h *CommentPostedHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	doiId := parser.BigIntArg(event.Args, "doiId").Uint64()
	reader := parser.AddressArg(event.Args, "reader")
	hash := parser.Bytes32Arg(event.Args, "hash")
	hashHex := "0x" + hex.EncodeToString(hash[:])
	return h.repo.InsertComment(ctx, tx, idxrepo.CommentRow{
		DoiTokenId:       doiId,
		CommenterAddress: reader.Hex(),
		ContentHash:      hashHex,
		TxHash:           event.Raw.TxHash.Hex(),
		BlockNumber:      event.Raw.BlockNumber,
	})
}
