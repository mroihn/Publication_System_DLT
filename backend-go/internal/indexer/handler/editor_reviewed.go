package handler

import (
	"context"
	"database/sql"

	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
)

type EditorReviewedHandler struct {
	repo idxrepo.IndexerRepository
}

func (h *EditorReviewedHandler) EventName() string { return "EditorReviewed" }

// Handle records the editor-assigned field on the manuscript. The status change
// (UNDER_REVIEW or REJECTED) is carried by the accompanying DecisionMade event.
func (h *EditorReviewedHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	field := parser.StringArg(event.Args, "field")
	return h.repo.UpdateManuscriptField(ctx, tx, msId, field)
}
