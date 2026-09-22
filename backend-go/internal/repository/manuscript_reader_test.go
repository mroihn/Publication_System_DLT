package repository

import (
	"testing"

	"github.com/mroihn/ta-proj/backend-go/internal/chainquery"
)

func TestRejectionReason(t *testing.T) {
	const rejected, underReview = 5, 2
	cases := []struct {
		name string
		m    chainquery.Manuscript
		want string
	}{
		{"plagiarism", chainquery.Manuscript{Status: rejected, PlagiarismScore: 45}, "PLAGIARISM"},
		{"peer review", chainquery.Manuscript{Status: rejected, PlagiarismScore: 10, ReviewCount: 3}, "PEER_REVIEW"},
		{"editor desk-reject", chainquery.Manuscript{Status: rejected, PlagiarismScore: 10}, "EDITOR"},
		{"at threshold passes plagiarism", chainquery.Manuscript{Status: rejected, PlagiarismScore: 30}, "EDITOR"},
		{"not rejected", chainquery.Manuscript{Status: underReview, ReviewCount: 3}, ""},
	}
	for _, c := range cases {
		got := ""
		if r := rejectionReason(&c.m); r != nil {
			got = *r
		}
		if got != c.want {
			t.Errorf("%s: rejectionReason = %q, want %q", c.name, got, c.want)
		}
	}
}
