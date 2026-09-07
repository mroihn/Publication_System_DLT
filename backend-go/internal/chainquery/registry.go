package chainquery

import (
	"context"
	"fmt"
	"math/big"
	"reflect"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// Manuscript mirrors PublicationRegistry.sol's Manuscript struct.
type Manuscript struct {
	ID              uint64
	Author          common.Address
	CID             string
	Metadata        string
	Status          uint8
	Version         uint64
	PlagiarismScore uint64
	Reviewers       []common.Address
	AcceptCount     uint64
	RejectCount     uint64
	ReviseCount     uint64
	ReviewCount     uint64
	DOI             string
	Field           string
}

// RegistryReader reads PublicationRegistry state directly from the chain —
// view-function calls for current state, eth_getLogs for anything that needs
// history (a manuscript's on-chain review/verdict mappings are overwritten on
// every revision, so only past event logs preserve prior rounds).
type RegistryReader struct {
	client      BlockchainClient
	address     common.Address
	viewABI     abi.ABI
	eventsABI   abi.ABI
	deployBlock uint64
}

func NewRegistryReader(client BlockchainClient, address string, deployBlock uint64) (*RegistryReader, error) {
	viewABI, err := parseABI(RegistryViewABI)
	if err != nil {
		return nil, fmt.Errorf("parse registry view ABI: %w", err)
	}
	eventsABI, err := parseABI(RegistryEventsABI)
	if err != nil {
		return nil, fmt.Errorf("parse registry events ABI: %w", err)
	}
	return &RegistryReader{
		client:      client,
		address:     common.HexToAddress(address),
		viewABI:     viewABI,
		eventsABI:   eventsABI,
		deployBlock: deployBlock,
	}, nil
}

func (r *RegistryReader) call(ctx context.Context, method string, args ...any) ([]byte, error) {
	data, err := r.viewABI.Pack(method, args...)
	if err != nil {
		return nil, fmt.Errorf("pack %s: %w", method, err)
	}
	out, err := callContractWithRetry(ctx, r.client, ethereum.CallMsg{To: &r.address, Data: data})
	if err != nil {
		return nil, fmt.Errorf("call %s: %w", method, err)
	}
	return out, nil
}

// GetManuscript reads a manuscript's current state via getManuscript(msId).
func (r *RegistryReader) GetManuscript(ctx context.Context, msId uint64) (*Manuscript, error) {
	out, err := r.call(ctx, "getManuscript", new(big.Int).SetUint64(msId))
	if err != nil {
		return nil, err
	}
	vals, err := r.viewABI.Unpack("getManuscript", out)
	if err != nil || len(vals) == 0 {
		return nil, fmt.Errorf("unpack getManuscript(%d): %w", msId, err)
	}
	v := reflect.ValueOf(vals[0])
	get := func(name string) reflect.Value { return v.FieldByName(name) }

	reviewersVal := get("Reviewers").Interface().([]common.Address)

	return &Manuscript{
		ID:              get("Id").Interface().(*big.Int).Uint64(),
		Author:          get("Author").Interface().(common.Address),
		CID:             get("Cid").Interface().(string),
		Metadata:        get("Metadata").Interface().(string),
		Status:          get("Status").Interface().(uint8),
		Version:         get("Version").Interface().(*big.Int).Uint64(),
		PlagiarismScore: get("PlagiarismScore").Interface().(*big.Int).Uint64(),
		Reviewers:       reviewersVal,
		AcceptCount:     get("AcceptCount").Interface().(*big.Int).Uint64(),
		RejectCount:     get("RejectCount").Interface().(*big.Int).Uint64(),
		ReviseCount:     get("ReviseCount").Interface().(*big.Int).Uint64(),
		ReviewCount:     get("ReviewCount").Interface().(*big.Int).Uint64(),
		DOI:             get("Doi").Interface().(string),
		Field:           get("Field").Interface().(string),
	}, nil
}

// NextManuscriptID reads the public nextManuscriptId counter — the only way
// to enumerate manuscript IDs, since the contract has no listing function.
func (r *RegistryReader) NextManuscriptID(ctx context.Context) (uint64, error) {
	out, err := r.call(ctx, "nextManuscriptId")
	if err != nil {
		return 0, err
	}
	vals, err := r.viewABI.Unpack("nextManuscriptId", out)
	if err != nil || len(vals) == 0 {
		return 0, fmt.Errorf("unpack nextManuscriptId: %w", err)
	}
	return vals[0].(*big.Int).Uint64(), nil
}

// HasReviewed reads the hasReviewed[msId][reviewer] mapping — current round
// only; it is reset on every revision, so it cannot answer "did this address
// review any past round" (that needs LogsForManuscript instead).
func (r *RegistryReader) HasReviewed(ctx context.Context, msId uint64, reviewer common.Address) (bool, error) {
	out, err := r.call(ctx, "hasReviewed", new(big.Int).SetUint64(msId), reviewer)
	if err != nil {
		return false, err
	}
	vals, err := r.viewABI.Unpack("hasReviewed", out)
	if err != nil || len(vals) == 0 {
		return false, fmt.Errorf("unpack hasReviewed: %w", err)
	}
	return vals[0].(bool), nil
}

// LogsForManuscript fetches and decodes the named Registry events for one
// manuscript, filtered by its indexed msId topic, from the contract's deploy
// block to the current head.
func (r *RegistryReader) LogsForManuscript(ctx context.Context, msId uint64, eventNames ...string) ([]DecodedLog, error) {
	var sigTopics []common.Hash
	for _, name := range eventNames {
		ev, ok := r.eventsABI.Events[name]
		if !ok {
			return nil, fmt.Errorf("unknown registry event %q", name)
		}
		sigTopics = append(sigTopics, ev.ID)
	}
	head, err := r.client.BlockNumber(ctx)
	if err != nil {
		return nil, err
	}
	msIdTopic := common.BigToHash(new(big.Int).SetUint64(msId))
	q := ethereum.FilterQuery{
		Addresses: []common.Address{r.address},
		Topics:    [][]common.Hash{sigTopics, {msIdTopic}},
	}
	logs, err := FetchLogsWindowed(ctx, r.client, q, r.deployBlock, head)
	if err != nil {
		return nil, err
	}
	return decodeLogs(r.eventsABI, logs)
}

// AllManuscriptSubmittedLogs fetches every ManuscriptSubmitted event across
// the whole contract history in one windowed query, so a list endpoint can
// get every manuscript's submission tx/block/timestamp without an
// eth_getLogs call per row.
func (r *RegistryReader) AllManuscriptSubmittedLogs(ctx context.Context) ([]DecodedLog, error) {
	ev, ok := r.eventsABI.Events["ManuscriptSubmitted"]
	if !ok {
		return nil, fmt.Errorf("unknown registry event %q", "ManuscriptSubmitted")
	}
	head, err := r.client.BlockNumber(ctx)
	if err != nil {
		return nil, err
	}
	q := ethereum.FilterQuery{
		Addresses: []common.Address{r.address},
		Topics:    [][]common.Hash{{ev.ID}},
	}
	logs, err := FetchLogsWindowed(ctx, r.client, q, r.deployBlock, head)
	if err != nil {
		return nil, err
	}
	return decodeLogs(r.eventsABI, logs)
}

// Client exposes the underlying RPC client for block-timestamp lookups
// shared across readers (BlockTime is a free function, not tied to one
// contract).
func (r *RegistryReader) Client() BlockchainClient { return r.client }
