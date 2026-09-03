package chainquery

import (
	"context"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// MaxLogRange keeps each eth_getLogs call within the RPC provider's block-range
// limit (Infura caps it at 10,000 blocks).
const MaxLogRange = uint64(9000)

// DecodedLog is a single event log decoded into its named arguments.
type DecodedLog struct {
	Name string
	Args map[string]interface{}
	Raw  types.Log
}

// FetchLogsWindowed fetches logs for [from, to] in windows of at most
// MaxLogRange blocks, retrying transient errors with backoff. Request pacing
// against the provider's rate limit happens once, centrally, in
// EthClientAdapter (shared across every reader and every concurrent
// goroutine) — not here, since a per-call delay in this function alone
// can't account for other readers hitting the same client concurrently.
// On persistent non-rate-limit errors (e.g. "range too large") it bisects
// the window, mirroring the retry/bisect behavior the old background
// indexer used; a rate-limit error is retried in place instead, since
// bisecting it only issues more requests into the same limit.
func FetchLogsWindowed(ctx context.Context, client BlockchainClient, q ethereum.FilterQuery, from, to uint64) ([]types.Log, error) {
	var all []types.Log
	for start := from; start <= to; start += MaxLogRange {
		end := start + MaxLogRange - 1
		if end > to {
			end = to
		}
		logs, err := fetchLogsWindow(ctx, client, q, start, end)
		if err != nil {
			return nil, err
		}
		all = append(all, logs...)
		if err := ctx.Err(); err != nil {
			return nil, err
		}
	}
	return all, nil
}

func isRateLimited(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "Too Many Requests") || strings.Contains(msg, "429") || strings.Contains(msg, "-32005")
}

// callContractWithRetry retries a single eth_call on transient/rate-limit
// errors with backoff. Plain view-function calls (getManuscript,
// nextManuscriptId, hasReviewed) have no "range too large" failure mode to
// bisect — a retry loop is all they need.
func callContractWithRetry(ctx context.Context, client BlockchainClient, msg ethereum.CallMsg) ([]byte, error) {
	var lastErr error
	delay := 500 * time.Millisecond
	for attempt := 0; attempt < 5; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
			delay *= 2
		}
		out, err := client.CallContract(ctx, msg, nil)
		if err == nil {
			return out, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

func fetchLogsWindow(ctx context.Context, client BlockchainClient, q ethereum.FilterQuery, from, to uint64) ([]types.Log, error) {
	query := q
	query.FromBlock = new(big.Int).SetUint64(from)
	query.ToBlock = new(big.Int).SetUint64(to)

	var lastErr error
	delay := 500 * time.Millisecond
	for attempt := 0; attempt < 5; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
			delay *= 2
		}
		logs, err := client.FilterLogs(ctx, query)
		if err == nil {
			return logs, nil
		}
		lastErr = err
		if isRateLimited(err) {
			continue // same window, longer backoff — bisecting would only add requests
		}
	}

	if isRateLimited(lastErr) {
		return nil, lastErr
	}
	if from < to {
		mid := from + (to-from)/2
		left, err := fetchLogsWindow(ctx, client, q, from, mid)
		if err != nil {
			return nil, err
		}
		right, err := fetchLogsWindow(ctx, client, q, mid+1, to)
		if err != nil {
			return nil, err
		}
		return append(left, right...), nil
	}
	return nil, lastErr
}

// decodeLogs decodes raw logs against a single contract's event-only ABI.
func decodeLogs(parsedABI abi.ABI, logs []types.Log) ([]DecodedLog, error) {
	out := make([]DecodedLog, 0, len(logs))
	for _, l := range logs {
		if len(l.Topics) == 0 {
			continue
		}
		var ev *abi.Event
		for _, e := range parsedABI.Events {
			if e.ID == l.Topics[0] {
				evCopy := e
				ev = &evCopy
				break
			}
		}
		if ev == nil {
			continue
		}
		args := make(map[string]interface{})
		if err := parsedABI.UnpackIntoMap(args, ev.Name, l.Data); err != nil {
			return nil, err
		}
		var indexedArgs abi.Arguments
		for _, arg := range ev.Inputs {
			if arg.Indexed {
				indexedArgs = append(indexedArgs, arg)
			}
		}
		if err := abi.ParseTopicsIntoMap(args, indexedArgs, l.Topics[1:]); err != nil {
			return nil, err
		}
		out = append(out, DecodedLog{Name: ev.Name, Args: args, Raw: l})
	}
	return out, nil
}

func parseABI(json string) (abi.ABI, error) {
	return abi.JSON(strings.NewReader(json))
}

// BlockTime returns a block's timestamp. Not cached across calls — callers
// that need many timestamps within one request should memoize locally.
func BlockTime(ctx context.Context, client BlockchainClient, blockNumber uint64) (time.Time, error) {
	header, err := client.HeaderByNumber(ctx, new(big.Int).SetUint64(blockNumber))
	if err != nil {
		return time.Time{}, err
	}
	return time.Unix(int64(header.Time), 0).UTC(), nil
}

// Argument helpers for DecodedLog.Args.

func BigIntArg(args map[string]interface{}, key string) *big.Int {
	if v, ok := args[key].(*big.Int); ok {
		return v
	}
	return big.NewInt(0)
}

func StringArg(args map[string]interface{}, key string) string {
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

func AddressArg(args map[string]interface{}, key string) common.Address {
	if v, ok := args[key].(common.Address); ok {
		return v
	}
	return common.Address{}
}

func AddressSliceArg(args map[string]interface{}, key string) []common.Address {
	if v, ok := args[key].([]common.Address); ok {
		return v
	}
	return nil
}

func Uint8Arg(args map[string]interface{}, key string) uint8 {
	if v, ok := args[key].(uint8); ok {
		return v
	}
	return 0
}

func Bytes32Arg(args map[string]interface{}, key string) [32]byte {
	if v, ok := args[key].([32]byte); ok {
		return v
	}
	return [32]byte{}
}
