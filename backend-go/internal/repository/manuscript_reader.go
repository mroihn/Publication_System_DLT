package repository

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/mroihn/ta-proj/backend-go/internal/chainquery"
)

type ManuscriptReader interface {
	ListManuscripts(ctx context.Context) ([]ManuscriptSummary, error)
	// ListManuscriptsPaged lists manuscripts, optionally filtered by status
	// (empty string = no filter). Backs both the Tracker (all statuses) and
	// the Explore hub (status=PUBLISHED) via the same endpoint.
	ListManuscriptsPaged(ctx context.Context, limit, offset int, status string) ([]ManuscriptSummary, error)
	CountManuscripts(ctx context.Context, status string) (int, error)
	GetManuscriptByID(ctx context.Context, msId uint64) (*ManuscriptDetail, error)
	GetOpenReview(ctx context.Context, msId uint64) (*OpenReview, error)
}

type OpenReviewEntry struct {
	ReviewerAddress string  `json:"reviewer_address"`
	Verdict         string  `json:"verdict"`
	ReviewCid       *string `json:"review_cid"`
	TxHash          string  `json:"tx_hash"`
}

type OpenReviewVersion struct {
	Version   int               `json:"version"`
	Date      *time.Time        `json:"date"`
	Reviewers []string          `json:"reviewers"`
	Reviews   []OpenReviewEntry `json:"reviews"`
}

type OpenReview struct {
	MsId          uint64              `json:"ms_id"`
	Status        string              `json:"status"`
	AuthorAddress string              `json:"author_address"`
	Versions      []OpenReviewVersion `json:"versions"`
	Reviewers     []string            `json:"reviewers"`
}

type ManuscriptSummary struct {
	MsId            uint64     `json:"ms_id"`
	CID             string     `json:"cid"`
	Metadata        string     `json:"metadata"`
	Status          string     `json:"status"`
	Version         int        `json:"version"`
	AuthorAddress   string     `json:"author_address"`
	PlagiarismScore *int       `json:"plagiarism_score"`
	SubmitTxHash    string     `json:"submit_tx_hash"`
	SubmitBlock     int64      `json:"submit_block"`
	SubmitTimestamp *time.Time `json:"submit_timestamp"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	RejectionReason *string    `json:"rejection_reason"`
}

type ManuscriptReviewer struct {
	ReviewerAddress string    `json:"reviewer_address"`
	AssignedAt      time.Time `json:"assigned_at"`
}

type ManuscriptReview struct {
	ReviewerAddress string    `json:"reviewer_address"`
	Verdict         string    `json:"verdict"`
	ReviewCid       *string   `json:"review_cid,omitempty"`
	TxHash          string    `json:"tx_hash"`
	BlockNumber     int64     `json:"block_number"`
	SubmittedAt     time.Time `json:"submitted_at"`
}

type ManuscriptRevision struct {
	NewCID      string    `json:"new_cid"`
	Version     int       `json:"version"`
	TxHash      string    `json:"tx_hash"`
	BlockNumber int64     `json:"block_number"`
	RevisedAt   time.Time `json:"revised_at"`
}

type PlagiarismRequest struct {
	RequestID   uint64     `json:"request_id"`
	Score       *int       `json:"score"`
	Fulfilled   bool       `json:"fulfilled"`
	RequestedAt time.Time  `json:"requested_at"`
	FulfilledAt *time.Time `json:"fulfilled_at"`
}

type ProcessedEvent struct {
	EventName    string    `json:"event_name"`
	TxHash       string    `json:"tx_hash"`
	BlockNumber  uint64    `json:"block_number"`
	LogIndex     uint      `json:"log_index"`
	ContractAddr string    `json:"contract_addr"`
	ProcessedAt  time.Time `json:"processed_at"`
}

type ManuscriptDetail struct {
	ManuscriptSummary
	Metadata       string               `json:"metadata"`
	Field          *string              `json:"field"`
	DOI            *string              `json:"doi"`
	DOITokenID     *int64               `json:"doi_token_id"`
	AcceptCount    int                  `json:"accept_count"`
	RejectCount    int                  `json:"reject_count"`
	ReviseCount    int                  `json:"revise_count"`
	Reviewers      []ManuscriptReviewer `json:"reviewers"`
	Reviews        []ManuscriptReview   `json:"reviews"`
	Revisions      []ManuscriptRevision `json:"revisions"`
	PlagiarismReqs []PlagiarismRequest  `json:"plagiarism_requests"`
	Events         []ProcessedEvent     `json:"events"`
}

// ChainManuscriptReader implements ManuscriptReader by reading directly from
// the deployed contracts on every call — there is no off-chain cache. List
// endpoints therefore cost one RPC call per manuscript (parallelized); this
// is an accepted, disclosed trade-off, not an oversight.
type ChainManuscriptReader struct {
	registry *chainquery.RegistryReader
	oracle   *chainquery.OracleReader
}

func NewChainManuscriptReader(registry *chainquery.RegistryReader, oracle *chainquery.OracleReader) *ChainManuscriptReader {
	return &ChainManuscriptReader{registry: registry, oracle: oracle}
}

// maxParallelReads bounds concurrent eth_call requests when enumerating all
// manuscripts, so a large manuscript count doesn't open hundreds of
// simultaneous RPC connections.
const maxParallelReads = 12

func summaryFromManuscript(m *chainquery.Manuscript) ManuscriptSummary {
	score := int(m.PlagiarismScore)
	return ManuscriptSummary{
		MsId:            m.ID,
		CID:             m.CID,
		Metadata:        m.Metadata,
		Status:          chainquery.StatusNames[m.Status],
		Version:         int(m.Version),
		AuthorAddress:   m.Author.Hex(),
		PlagiarismScore: &score,
		RejectionReason: rejectionReason(m),
		// SubmitTxHash/SubmitBlock/SubmitTimestamp/CreatedAt have no
		// contract-view equivalent (only in the ManuscriptSubmitted event log)
		// — filled in by fetchAllSummaries from one batched log query shared
		// across the whole list, not one query per row.
	}
}

// plagiarismThreshold mirrors PublicationRegistry.PLAGIARISM_THRESHOLD.
const plagiarismThreshold = 30

// rejectionReason tells apart the three ways a manuscript reaches REJECTED
// using only the contract's current state. Review counters are reset on every
// revision, so they describe the final round alone: a failing plagiarism score
// means the oracle rejected it, reviews in this round mean the reviewers did,
// and a rejection with neither can only be the editor's desk review.
func rejectionReason(m *chainquery.Manuscript) *string {
	if chainquery.StatusNames[m.Status] != "REJECTED" {
		return nil
	}
	reason := "EDITOR"
	switch {
	case m.PlagiarismScore > plagiarismThreshold:
		reason = "PLAGIARISM"
	case m.ReviewCount > 0:
		reason = "PEER_REVIEW"
	}
	return &reason
}

// fetchAllSummaries enumerates every manuscript ID and reads each one in
// parallel, then fills in each summary's submission tx/block/timestamp from
// a single batched ManuscriptSubmitted log query (one eth_getLogs call for
// the whole list, not one per manuscript). Called once per
// ListManuscriptsPaged/CountManuscripts/ListManuscripts invocation — no
// caching, per the "always read live" design.
func (r *ChainManuscriptReader) fetchAllSummaries(ctx context.Context) ([]ManuscriptSummary, error) {
	next, err := r.registry.NextManuscriptID(ctx)
	if err != nil {
		return nil, err
	}

	results := make([]ManuscriptSummary, next)
	var wg sync.WaitGroup
	sem := make(chan struct{}, maxParallelReads)
	errCh := make(chan error, 1)

	for id := uint64(0); id < next; id++ {
		wg.Add(1)
		go func(id uint64) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			m, err := r.registry.GetManuscript(ctx, id)
			if err != nil {
				select {
				case errCh <- err:
				default:
				}
				return
			}
			results[id] = summaryFromManuscript(m)
		}(id)
	}

	submittedLogs, submitErr := r.registry.AllManuscriptSubmittedLogs(ctx)

	wg.Wait()
	select {
	case err := <-errCh:
		return nil, err
	default:
	}
	if submitErr != nil {
		return nil, submitErr
	}

	btc := newBlockTimeCache(ctx, r.registry.Client())
	for _, l := range submittedLogs {
		msId := chainquery.BigIntArg(l.Args, "msId").Uint64()
		if msId >= uint64(len(results)) {
			continue
		}
		t := btc.get(l.Raw.BlockNumber)
		results[msId].SubmitTxHash = l.Raw.TxHash.Hex()
		results[msId].SubmitBlock = int64(l.Raw.BlockNumber)
		results[msId].SubmitTimestamp = &t
		results[msId].CreatedAt = t
	}

	sort.Slice(results, func(i, j int) bool { return results[i].MsId > results[j].MsId })
	return results, nil
}

func (r *ChainManuscriptReader) ListManuscripts(ctx context.Context) ([]ManuscriptSummary, error) {
	return r.fetchAllSummaries(ctx)
}

func (r *ChainManuscriptReader) ListManuscriptsPaged(ctx context.Context, limit, offset int, status string) ([]ManuscriptSummary, error) {
	all, err := r.fetchAllSummaries(ctx)
	if err != nil {
		return nil, err
	}
	filtered := all
	if status != "" {
		filtered = make([]ManuscriptSummary, 0, len(all))
		for _, m := range all {
			if m.Status == status {
				filtered = append(filtered, m)
			}
		}
	}
	if offset >= len(filtered) {
		return []ManuscriptSummary{}, nil
	}
	end := offset + limit
	if end > len(filtered) {
		end = len(filtered)
	}
	out := filtered[offset:end]
	if out == nil {
		out = []ManuscriptSummary{}
	}
	return out, nil
}

func (r *ChainManuscriptReader) CountManuscripts(ctx context.Context, status string) (int, error) {
	all, err := r.fetchAllSummaries(ctx)
	if err != nil {
		return 0, err
	}
	if status == "" {
		return len(all), nil
	}
	n := 0
	for _, m := range all {
		if m.Status == status {
			n++
		}
	}
	return n, nil
}

// blockTimeCache memoizes header lookups within a single request — many logs
// for one manuscript often share a block (or a small number of blocks), and
// this avoids repeat HeaderByNumber calls without persisting anything.
type blockTimeCache struct {
	ctx    context.Context
	client chainquery.BlockchainClient
	cache  map[uint64]time.Time
}

func newBlockTimeCache(ctx context.Context, client chainquery.BlockchainClient) *blockTimeCache {
	return &blockTimeCache{ctx: ctx, client: client, cache: map[uint64]time.Time{}}
}

func (c *blockTimeCache) get(blockNumber uint64) time.Time {
	if t, ok := c.cache[blockNumber]; ok {
		return t
	}
	t, err := chainquery.BlockTime(c.ctx, c.client, blockNumber)
	if err != nil {
		return time.Time{}
	}
	c.cache[blockNumber] = t
	return t
}

func (r *ChainManuscriptReader) GetManuscriptByID(ctx context.Context, msId uint64) (*ManuscriptDetail, error) {
	next, err := r.registry.NextManuscriptID(ctx)
	if err != nil {
		return nil, err
	}
	if msId >= next {
		return nil, nil
	}

	var (
		ms       *chainquery.Manuscript
		logs     []chainquery.DecodedLog
		plagLogs []chainquery.DecodedLog
		wg       sync.WaitGroup
		mu       sync.Mutex
		firstErr error
	)
	setErr := func(e error) {
		mu.Lock()
		if firstErr == nil {
			firstErr = e
		}
		mu.Unlock()
	}

	wg.Add(3)
	go func() {
		defer wg.Done()
		m, err := r.registry.GetManuscript(ctx, msId)
		if err != nil {
			setErr(err)
			return
		}
		ms = m
	}()
	go func() {
		defer wg.Done()
		l, err := r.registry.LogsForManuscript(ctx, msId,
			"ManuscriptSubmitted", "ReviewersAssigned", "ReviewSubmitted",
			"ManuscriptRevised", "DOIMinted")
		if err != nil {
			setErr(err)
			return
		}
		logs = l
	}()
	go func() {
		defer wg.Done()
		l, err := r.oracle.PlagiarismLogsForManuscript(ctx, msId)
		if err != nil {
			setErr(err)
			return
		}
		plagLogs = l
	}()
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}

	btc := newBlockTimeCache(ctx, r.registry.Client())

	d := &ManuscriptDetail{
		ManuscriptSummary: summaryFromManuscript(ms),
		Reviewers:          []ManuscriptReviewer{},
		Reviews:            []ManuscriptReview{},
		Revisions:          []ManuscriptRevision{},
		PlagiarismReqs:     []PlagiarismRequest{},
		Events:             []ProcessedEvent{},
	}
	if ms.Field != "" {
		f := ms.Field
		d.Field = &f
	}
	if ms.DOI != "" {
		doi := ms.DOI
		d.DOI = &doi
	}
	d.AcceptCount = int(ms.AcceptCount)
	d.RejectCount = int(ms.RejectCount)
	d.ReviseCount = int(ms.ReviseCount)

	sort.Slice(logs, func(i, j int) bool {
		if logs[i].Raw.BlockNumber != logs[j].Raw.BlockNumber {
			return logs[i].Raw.BlockNumber < logs[j].Raw.BlockNumber
		}
		return logs[i].Raw.Index < logs[j].Raw.Index
	})

	for _, l := range logs {
		t := btc.get(l.Raw.BlockNumber)
		switch l.Name {
		case "ManuscriptSubmitted":
			d.SubmitTxHash = l.Raw.TxHash.Hex()
			d.SubmitBlock = int64(l.Raw.BlockNumber)
			tt := t
			d.SubmitTimestamp = &tt
			d.CreatedAt = t
			d.UpdatedAt = t
		case "ReviewersAssigned":
			for _, addr := range chainquery.AddressSliceArg(l.Args, "reviewers") {
				d.Reviewers = append(d.Reviewers, ManuscriptReviewer{ReviewerAddress: addr.Hex(), AssignedAt: t})
			}
		case "ReviewSubmitted":
			cid := chainquery.StringArg(l.Args, "reviewCid")
			d.Reviews = append(d.Reviews, ManuscriptReview{
				ReviewerAddress: chainquery.AddressArg(l.Args, "reviewer").Hex(),
				Verdict:         chainquery.VerdictNames[chainquery.Uint8Arg(l.Args, "verdict")],
				ReviewCid:       &cid,
				TxHash:          l.Raw.TxHash.Hex(),
				BlockNumber:     int64(l.Raw.BlockNumber),
				SubmittedAt:     t,
			})
		case "ManuscriptRevised":
			d.Revisions = append(d.Revisions, ManuscriptRevision{
				NewCID:      chainquery.StringArg(l.Args, "newCid"),
				Version:     int(chainquery.BigIntArg(l.Args, "version").Uint64()),
				TxHash:      l.Raw.TxHash.Hex(),
				BlockNumber: int64(l.Raw.BlockNumber),
				RevisedAt:   t,
			})
		case "DOIMinted":
			id := chainquery.BigIntArg(l.Args, "doiTokenId").Int64()
			d.DOITokenID = &id
		}
		d.Events = append(d.Events, ProcessedEvent{
			EventName:    l.Name,
			TxHash:       l.Raw.TxHash.Hex(),
			BlockNumber:  l.Raw.BlockNumber,
			LogIndex:     l.Raw.Index,
			ContractAddr: l.Raw.Address.Hex(),
			ProcessedAt:  t,
		})
	}

	// Pair PlagiarismCheckRequested/Fulfilled by requestId.
	reqs := map[uint64]*PlagiarismRequest{}
	var reqOrder []uint64
	for _, l := range plagLogs {
		reqID := chainquery.BigIntArg(l.Args, "requestId").Uint64()
		pr, ok := reqs[reqID]
		if !ok {
			pr = &PlagiarismRequest{RequestID: reqID}
			reqs[reqID] = pr
			reqOrder = append(reqOrder, reqID)
		}
		t := btc.get(l.Raw.BlockNumber)
		switch l.Name {
		case "PlagiarismCheckRequested":
			pr.RequestedAt = t
		case "PlagiarismCheckFulfilled":
			pr.Fulfilled = true
			score := int(chainquery.BigIntArg(l.Args, "score").Uint64())
			pr.Score = &score
			ft := t
			pr.FulfilledAt = &ft
		}
	}
	sort.Slice(reqOrder, func(i, j int) bool { return reqOrder[i] < reqOrder[j] })
	for _, id := range reqOrder {
		d.PlagiarismReqs = append(d.PlagiarismReqs, *reqs[id])
	}

	return d, nil
}

func (r *ChainManuscriptReader) GetOpenReview(ctx context.Context, msId uint64) (*OpenReview, error) {
	next, err := r.registry.NextManuscriptID(ctx)
	if err != nil {
		return nil, err
	}
	if msId >= next {
		return nil, nil
	}

	ms, err := r.registry.GetManuscript(ctx, msId)
	if err != nil {
		return nil, err
	}

	logs, err := r.registry.LogsForManuscript(ctx, msId,
		"ManuscriptSubmitted", "ManuscriptRevised", "ReviewersAssigned", "ReviewSubmitted")
	if err != nil {
		return nil, err
	}
	sort.Slice(logs, func(i, j int) bool {
		if logs[i].Raw.BlockNumber != logs[j].Raw.BlockNumber {
			return logs[i].Raw.BlockNumber < logs[j].Raw.BlockNumber
		}
		return logs[i].Raw.Index < logs[j].Raw.Index
	})

	btc := newBlockTimeCache(ctx, r.registry.Client())

	type revisionMark struct {
		block   uint64
		version int
	}
	var revisions []revisionMark
	dateOf := map[int]*time.Time{}

	for _, l := range logs {
		switch l.Name {
		case "ManuscriptSubmitted":
			t := btc.get(l.Raw.BlockNumber)
			dateOf[1] = &t
		case "ManuscriptRevised":
			v := int(chainquery.BigIntArg(l.Args, "version").Uint64())
			revisions = append(revisions, revisionMark{block: l.Raw.BlockNumber, version: v})
			t := btc.get(l.Raw.BlockNumber)
			dateOf[v] = &t
		}
	}

	// version = 1 + count(revisions with revision.block <= log.block) — same
	// bucketing formula the old off-chain projection used (migration
	// 010_review_versions_and_comments.up.sql), computed here from logs
	// instead of from a mirrored table.
	versionOf := func(blockNumber uint64) int {
		v := 1
		for _, rv := range revisions {
			if rv.block <= blockNumber {
				v++
			}
		}
		return v
	}

	maxVersion := 1 + len(revisions)
	versions := make([]OpenReviewVersion, maxVersion)
	for i := 0; i < maxVersion; i++ {
		versions[i] = OpenReviewVersion{Version: i + 1, Date: dateOf[i+1], Reviewers: []string{}, Reviews: []OpenReviewEntry{}}
	}

	seen := map[string]bool{}
	var allReviewers []string

	for _, l := range logs {
		switch l.Name {
		case "ReviewersAssigned":
			v := versionOf(l.Raw.BlockNumber)
			for _, addr := range chainquery.AddressSliceArg(l.Args, "reviewers") {
				a := addr.Hex()
				versions[v-1].Reviewers = append(versions[v-1].Reviewers, a)
				if !seen[a] {
					seen[a] = true
					allReviewers = append(allReviewers, a)
				}
			}
		case "ReviewSubmitted":
			v := versionOf(l.Raw.BlockNumber)
			cid := chainquery.StringArg(l.Args, "reviewCid")
			versions[v-1].Reviews = append(versions[v-1].Reviews, OpenReviewEntry{
				ReviewerAddress: chainquery.AddressArg(l.Args, "reviewer").Hex(),
				Verdict:         chainquery.VerdictNames[chainquery.Uint8Arg(l.Args, "verdict")],
				ReviewCid:       &cid,
				TxHash:          l.Raw.TxHash.Hex(),
			})
		}
	}
	for i := range versions {
		sort.Strings(versions[i].Reviewers)
	}

	return &OpenReview{
		MsId:          msId,
		Status:        chainquery.StatusNames[ms.Status],
		AuthorAddress: ms.Author.Hex(),
		Versions:      versions,
		Reviewers:     allReviewers,
	}, nil
}
