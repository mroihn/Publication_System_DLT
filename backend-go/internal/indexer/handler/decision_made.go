package handler

import (
	"context"
	"database/sql"
	"fmt"

	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
)

type DecisionMadeHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *DecisionMadeHandler) EventName() string { return "DecisionMade" }

func (h *DecisionMadeHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	statusCode := parser.Uint8Arg(event.Args, "decision")
	status, ok := parser.StatusNames[statusCode]
	if !ok {
		return fmt.Errorf("DecisionMade: unknown status code %d", statusCode)
	}
	return h.repo.UpdateManuscriptStatus(ctx, tx, msId, status)
}
