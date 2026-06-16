package handler

import (
	"context"
	"database/sql"
	"fmt"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type ReviewSubmittedHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *ReviewSubmittedHandler) EventName() string { return "ReviewSubmitted" }

func (h *ReviewSubmittedHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	reviewer := parser.AddressArg(event.Args, "reviewer")
	verdictCode := parser.Uint8Arg(event.Args, "verdict")
	verdict, ok := parser.VerdictNames[verdictCode]
	if !ok {
		return fmt.Errorf("ReviewSubmitted: unknown verdict code %d", verdictCode)
	}
	if err := h.repo.InsertReview(ctx, tx, idxrepo.ReviewRow{
		MsId:            msId,
		ReviewerAddress: reviewer.Hex(),
		Verdict:         verdict,
		TxHash:          event.Raw.TxHash.Hex(),
		BlockNumber:     event.Raw.BlockNumber,
	}); err != nil {
		return err
	}
	return h.repo.IncrementVerdictCount(ctx, tx, msId, verdict)
}
