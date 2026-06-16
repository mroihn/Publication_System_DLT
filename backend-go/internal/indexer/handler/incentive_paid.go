package handler

import (
	"context"
	"database/sql"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type IncentivePaidHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *IncentivePaidHandler) EventName() string { return "IncentivePaid" }

func (h *IncentivePaidHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	reviewer := parser.AddressArg(event.Args, "reviewer")
	amount := parser.BigIntArg(event.Args, "amount")
	return h.repo.InsertIncentivePayment(ctx, tx, idxrepo.IncentiveRow{
		ReviewerAddress: reviewer.Hex(),
		AmountWei:       amount.String(),
		TxHash:          event.Raw.TxHash.Hex(),
		BlockNumber:     event.Raw.BlockNumber,
	})
}
