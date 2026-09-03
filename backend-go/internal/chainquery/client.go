// Package chainquery reads on-chain state directly (eth_call / eth_getLogs) on
// demand, per request. There is no persistent off-chain mirror of chain data —
// callers always get a live read, at the cost of one or more RPC round trips.
package chainquery

import (
	"context"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"golang.org/x/time/rate"
)

type BlockchainClient interface {
	FilterLogs(ctx context.Context, query ethereum.FilterQuery) ([]types.Log, error)
	HeaderByNumber(ctx context.Context, number *big.Int) (*types.Header, error)
	BlockNumber(ctx context.Context) (uint64, error)
	CallContract(ctx context.Context, msg ethereum.CallMsg, blockNumber *big.Int) ([]byte, error)
	Close()
}

// requestsPerSecond caps calls to the underlying RPC endpoint. Public
// providers (Infura free tier, confirmed in practice) return 429 "Too Many
// Requests" well before any single window-fetch delay would suggest — the
// limit is on the connection as a whole, not per goroutine, so this must be
// shared across every reader built on the same client (RegistryReader,
// OracleReader, DOITokenReader all take the same *EthClientAdapter).
const requestsPerSecond = 2

type EthClientAdapter struct {
	client  *ethclient.Client
	limiter *rate.Limiter
}

func NewEthClientAdapter(rpcURL string) (*EthClientAdapter, error) {
	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, err
	}
	return &EthClientAdapter{
		client:  client,
		limiter: rate.NewLimiter(rate.Every(time.Second/requestsPerSecond), 1),
	}, nil
}

func (a *EthClientAdapter) FilterLogs(ctx context.Context, query ethereum.FilterQuery) ([]types.Log, error) {
	if err := a.limiter.Wait(ctx); err != nil {
		return nil, err
	}
	return a.client.FilterLogs(ctx, query)
}

func (a *EthClientAdapter) HeaderByNumber(ctx context.Context, number *big.Int) (*types.Header, error) {
	if err := a.limiter.Wait(ctx); err != nil {
		return nil, err
	}
	return a.client.HeaderByNumber(ctx, number)
}

func (a *EthClientAdapter) BlockNumber(ctx context.Context) (uint64, error) {
	if err := a.limiter.Wait(ctx); err != nil {
		return 0, err
	}
	return a.client.BlockNumber(ctx)
}

func (a *EthClientAdapter) CallContract(ctx context.Context, msg ethereum.CallMsg, blockNumber *big.Int) ([]byte, error) {
	if err := a.limiter.Wait(ctx); err != nil {
		return nil, err
	}
	return a.client.CallContract(ctx, msg, blockNumber)
}

func (a *EthClientAdapter) Close() {
	a.client.Close()
}
