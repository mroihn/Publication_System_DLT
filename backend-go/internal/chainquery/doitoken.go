package chainquery

import (
	"context"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// DOITokenReader reads DOIToken events directly from the chain. The contract
// has no comment-listing function at all — CommentPosted logs, filtered by
// the indexed doiId topic, are the only source.
type DOITokenReader struct {
	client      BlockchainClient
	address     common.Address
	eventsABI   abi.ABI
	deployBlock uint64
}

func NewDOITokenReader(client BlockchainClient, address string, deployBlock uint64) (*DOITokenReader, error) {
	eventsABI, err := parseABI(DOITokenEventsABI)
	if err != nil {
		return nil, fmt.Errorf("parse doitoken events ABI: %w", err)
	}
	return &DOITokenReader{
		client:      client,
		address:     common.HexToAddress(address),
		eventsABI:   eventsABI,
		deployBlock: deployBlock,
	}, nil
}

// CommentLogsForDOI fetches and decodes CommentPosted events for one DOI token.
func (r *DOITokenReader) CommentLogsForDOI(ctx context.Context, doiTokenID uint64) ([]DecodedLog, error) {
	ev, ok := r.eventsABI.Events["CommentPosted"]
	if !ok {
		return nil, fmt.Errorf("CommentPosted not found in ABI")
	}
	head, err := r.client.BlockNumber(ctx)
	if err != nil {
		return nil, err
	}
	doiTopic := common.BigToHash(new(big.Int).SetUint64(doiTokenID))
	q := ethereum.FilterQuery{
		Addresses: []common.Address{r.address},
		Topics:    [][]common.Hash{{ev.ID}, {doiTopic}},
	}
	logs, err := FetchLogsWindowed(ctx, r.client, q, r.deployBlock, head)
	if err != nil {
		return nil, err
	}
	return decodeLogs(r.eventsABI, logs)
}

func (r *DOITokenReader) Client() BlockchainClient { return r.client }
