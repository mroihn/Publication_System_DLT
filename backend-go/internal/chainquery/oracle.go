package chainquery

import (
	"context"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// OracleReader reads ReviewOracle events directly from the chain. Fulfilled
// request state (score, selected reviewers) is only ever emitted in event
// args — never written to a queryable struct on the contract.
type OracleReader struct {
	client      BlockchainClient
	address     common.Address
	eventsABI   abi.ABI
	deployBlock uint64
}

func NewOracleReader(client BlockchainClient, address string, deployBlock uint64) (*OracleReader, error) {
	eventsABI, err := parseABI(OracleEventsABI)
	if err != nil {
		return nil, fmt.Errorf("parse oracle events ABI: %w", err)
	}
	return &OracleReader{
		client:      client,
		address:     common.HexToAddress(address),
		eventsABI:   eventsABI,
		deployBlock: deployBlock,
	}, nil
}

// PlagiarismLogsForManuscript fetches and decodes PlagiarismCheckRequested/
// PlagiarismCheckFulfilled events for one manuscript, filtered by its
// indexed msId topic.
func (r *OracleReader) PlagiarismLogsForManuscript(ctx context.Context, msId uint64) ([]DecodedLog, error) {
	var sigTopics []common.Hash
	for _, name := range []string{"PlagiarismCheckRequested", "PlagiarismCheckFulfilled"} {
		ev, ok := r.eventsABI.Events[name]
		if !ok {
			return nil, fmt.Errorf("unknown oracle event %q", name)
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
