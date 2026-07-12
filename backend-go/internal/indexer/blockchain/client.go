package blockchain

import (
	"context"
	"math/big"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

type BlockchainClient interface {
	FilterLogs(ctx context.Context, query ethereum.FilterQuery) ([]types.Log, error)
	SubscribeLogs(ctx context.Context, query ethereum.FilterQuery, ch chan<- types.Log) (ethereum.Subscription, error)
	HeaderByNumber(ctx context.Context, number *big.Int) (*types.Header, error)
	HeaderByHash(ctx context.Context, hash common.Hash) (*types.Header, error)
	BlockNumber(ctx context.Context) (uint64, error)
	TransactionByHash(ctx context.Context, hash common.Hash) (*types.Transaction, bool, error)
	CallContract(ctx context.Context, msg ethereum.CallMsg, blockNumber *big.Int) ([]byte, error)
	Close()
}

type EthClientAdapter struct {
	client *ethclient.Client
}

func NewEthClientAdapter(rpcURL string) (*EthClientAdapter, error) {
	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, err
	}
	return &EthClientAdapter{client: client}, nil
}

func (a *EthClientAdapter) FilterLogs(ctx context.Context, query ethereum.FilterQuery) ([]types.Log, error) {
	return a.client.FilterLogs(ctx, query)
}

func (a *EthClientAdapter) SubscribeLogs(ctx context.Context, query ethereum.FilterQuery, ch chan<- types.Log) (ethereum.Subscription, error) {
	return a.client.SubscribeFilterLogs(ctx, query, ch)
}

func (a *EthClientAdapter) HeaderByNumber(ctx context.Context, number *big.Int) (*types.Header, error) {
	return a.client.HeaderByNumber(ctx, number)
}

func (a *EthClientAdapter) HeaderByHash(ctx context.Context, hash common.Hash) (*types.Header, error) {
	return a.client.HeaderByHash(ctx, hash)
}

func (a *EthClientAdapter) BlockNumber(ctx context.Context) (uint64, error) {
	return a.client.BlockNumber(ctx)
}

func (a *EthClientAdapter) TransactionByHash(ctx context.Context, hash common.Hash) (*types.Transaction, bool, error) {
	return a.client.TransactionByHash(ctx, hash)
}

func (a *EthClientAdapter) CallContract(ctx context.Context, msg ethereum.CallMsg, blockNumber *big.Int) ([]byte, error) {
	return a.client.CallContract(ctx, msg, blockNumber)
}

func (a *EthClientAdapter) Close() {
	a.client.Close()
}
