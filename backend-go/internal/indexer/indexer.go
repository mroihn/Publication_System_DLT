package indexer

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"math/big"
	"sort"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/blockchain"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/handler"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
)

type Config struct {
	RegistryAddress string
	OracleAddress   string
	DOITokenAddress string
	StartBlock      uint64
	PollIntervalMs  int
	UseWebSocket    bool
}

type Indexer struct {
	client   blockchain.BlockchainClient
	parser   parser.EventParser
	handlers map[string]handler.EventHandler
	repo     idxrepo.IndexerRepository
	db       *sql.DB
	cfg      Config
}

func New(
	client blockchain.BlockchainClient,
	evtParser parser.EventParser,
	handlers map[string]handler.EventHandler,
	repo idxrepo.IndexerRepository,
	db *sql.DB,
	cfg Config,
) *Indexer {
	return &Indexer{
		client:   client,
		parser:   evtParser,
		handlers: handlers,
		repo:     repo,
		db:       db,
		cfg:      cfg,
	}
}

// RunHistoricalOnly runs only the historical sync phase and returns when complete.
// Used by the replay command.
func (idx *Indexer) RunHistoricalOnly(ctx context.Context) error {
	return idx.historicalSync(ctx)
}

func (idx *Indexer) Run(ctx context.Context) error {
	log.Println("Indexer: starting historical sync")
	if err := idx.historicalSync(ctx); err != nil {
		if errors.Is(err, context.Canceled) {
			return nil
		}
		return fmt.Errorf("historical sync: %w", err)
	}
	log.Println("Indexer: historical sync complete, starting live sync")
	if err := idx.liveSync(ctx); err != nil {
		if errors.Is(err, context.Canceled) {
			return nil
		}
		return fmt.Errorf("live sync: %w", err)
	}
	return nil
}

func (idx *Indexer) contractAddresses() []common.Address {
	addrs := []common.Address{}
	for _, a := range []string{idx.cfg.RegistryAddress, idx.cfg.OracleAddress, idx.cfg.DOITokenAddress} {
		if a != "" && a != "0x0000000000000000000000000000000000000000" {
			addrs = append(addrs, common.HexToAddress(a))
		}
	}
	return addrs
}

func (idx *Indexer) contractKey(addr common.Address) string {
	lower := addr.Hex()
	switch {
	case equalsIgnoreCase(lower, idx.cfg.RegistryAddress):
		return "registry"
	case equalsIgnoreCase(lower, idx.cfg.OracleAddress):
		return "oracle"
	case equalsIgnoreCase(lower, idx.cfg.DOITokenAddress):
		return "doitoken"
	}
	return "unknown"
}

func equalsIgnoreCase(a, b string) bool {
	return common.HexToAddress(a) == common.HexToAddress(b)
}

// historicalSync fetches all past logs for each contract from its checkpoint to the current head.
func (idx *Indexer) historicalSync(ctx context.Context) error {
	head, err := idx.client.BlockNumber(ctx)
	if err != nil {
		return err
	}

	addrs := idx.contractAddresses()
	if len(addrs) == 0 {
		log.Println("Indexer: no contract addresses configured, skipping sync")
		return nil
	}

	// Determine the earliest checkpoint across all contracts.
	fromBlock := head
	for _, key := range []string{"registry", "oracle", "doitoken"} {
		last, err := idx.repo.GetLastBlock(ctx, key)
		if err != nil {
			return err
		}
		start := idx.cfg.StartBlock
		if last > start {
			start = last + 1
		}
		if start < fromBlock {
			fromBlock = start
		}
	}

	if fromBlock > head {
		return nil
	}

	log.Printf("Indexer: fetching logs from block %d to %d", fromBlock, head)
	logs, err := idx.client.FilterLogs(ctx, ethereum.FilterQuery{
		FromBlock: big.NewInt(int64(fromBlock)),
		ToBlock:   big.NewInt(int64(head)),
		Addresses: addrs,
	})
	if err != nil {
		return err
	}

	// Sort by (blockNumber, logIndex) to ensure causal order.
	sort.Slice(logs, func(i, j int) bool {
		if logs[i].BlockNumber != logs[j].BlockNumber {
			return logs[i].BlockNumber < logs[j].BlockNumber
		}
		return logs[i].Index < logs[j].Index
	})

	for _, l := range logs {
		if err := idx.processLogWithRetry(ctx, l); err != nil {
			log.Printf("Indexer: error processing log %s[%d]: %v", l.TxHash.Hex(), l.Index, err)
		}
	}
	return nil
}

// liveSync subscribes to new logs via WebSocket or polls via HTTP.
func (idx *Indexer) liveSync(ctx context.Context) error {
	if idx.cfg.UseWebSocket {
		return idx.liveSyncWSS(ctx)
	}
	return idx.liveSyncHTTP(ctx)
}

func (idx *Indexer) liveSyncWSS(ctx context.Context) error {
	addrs := idx.contractAddresses()
	ch := make(chan types.Log, 128)
	backoff := time.Second

	for {
		sub, err := idx.client.SubscribeLogs(ctx, ethereum.FilterQuery{Addresses: addrs}, ch)
		if err != nil {
			log.Printf("Indexer: subscribe error: %v, retrying in %s", err, backoff)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
				if backoff < 30*time.Second {
					backoff *= 2
				}
				continue
			}
		}
		backoff = time.Second
		log.Println("Indexer: WebSocket subscription active")

	readLoop:
		for {
			select {
			case <-ctx.Done():
				sub.Unsubscribe()
				return ctx.Err()
			case err := <-sub.Err():
				log.Printf("Indexer: subscription error: %v, reconnecting", err)
				sub.Unsubscribe()
				break readLoop
			case l := <-ch:
				if err := idx.processLogWithRetry(ctx, l); err != nil {
					log.Printf("Indexer: error processing log %s[%d]: %v", l.TxHash.Hex(), l.Index, err)
				}
			}
		}
	}
}

func (idx *Indexer) liveSyncHTTP(ctx context.Context) error {
	interval := time.Duration(idx.cfg.PollIntervalMs) * time.Millisecond
	if interval == 0 {
		interval = 5 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	addrs := idx.contractAddresses()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			head, err := idx.client.BlockNumber(ctx)
			if err != nil {
				log.Printf("Indexer: block number error: %v", err)
				continue
			}
			// Use the minimum last block across contracts as fromBlock.
			fromBlock := head
			for _, key := range []string{"registry", "oracle", "doitoken"} {
				last, err := idx.repo.GetLastBlock(ctx, key)
				if err != nil {
					continue
				}
				next := last + 1
				if next < fromBlock {
					fromBlock = next
				}
			}
			if fromBlock > head {
				continue
			}
			logs, err := idx.client.FilterLogs(ctx, ethereum.FilterQuery{
				FromBlock: big.NewInt(int64(fromBlock)),
				ToBlock:   big.NewInt(int64(head)),
				Addresses: addrs,
			})
			if err != nil {
				log.Printf("Indexer: filter logs error: %v", err)
				continue
			}
			sort.Slice(logs, func(i, j int) bool {
				if logs[i].BlockNumber != logs[j].BlockNumber {
					return logs[i].BlockNumber < logs[j].BlockNumber
				}
				return logs[i].Index < logs[j].Index
			})
			for _, l := range logs {
				if err := idx.processLogWithRetry(ctx, l); err != nil {
					log.Printf("Indexer: error processing log %s[%d]: %v", l.TxHash.Hex(), l.Index, err)
				}
			}
		}
	}
}

// processLogWithRetry processes a single log with exponential backoff on transient errors.
func (idx *Indexer) processLogWithRetry(ctx context.Context, l types.Log) error {
	delay := 500 * time.Millisecond
	var lastErr error
	for attempt := 0; attempt < 5; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
			delay *= 2
			if delay > 30*time.Second {
				delay = 30 * time.Second
			}
		}
		err := idx.processLog(ctx, l)
		if err == nil {
			return nil
		}
		if isTransient(err) {
			lastErr = err
			log.Printf("Indexer: transient error (attempt %d/5): %v", attempt+1, err)
			continue
		}
		return err
	}
	return lastErr
}

// processLog is the atomic unit: parse → begin tx → idempotency check → handle → checkpoint → commit.
func (idx *Indexer) processLog(ctx context.Context, l types.Log) error {
	event, err := idx.parser.Parse(l)
	if err != nil {
		return fmt.Errorf("parse log: %w", err)
	}
	if event == nil {
		return nil // unrecognised event, skip
	}

	h, ok := idx.handlers[event.Name]
	if !ok {
		return nil // no handler registered, skip
	}

	tx, err := idx.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	already, err := idx.repo.MarkProcessed(ctx, tx,
		l.TxHash.Hex(), uint(l.Index), l.BlockNumber, event.Name, l.Address.Hex(),
	)
	if err != nil {
		return err
	}
	if already {
		return nil
	}

	if err := h.Handle(ctx, tx, event); err != nil {
		return fmt.Errorf("handle %s: %w", event.Name, err)
	}

	key := idx.contractKey(l.Address)
	if err := idx.repo.SaveLastBlock(ctx, tx, key, l.BlockNumber); err != nil {
		return err
	}

	return tx.Commit()
}

func isTransient(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	msg := err.Error()
	// covers pq.ErrBadConn and generic network errors
	return strings.Contains(msg, "connection") ||
		strings.Contains(msg, "timeout") ||
		strings.Contains(msg, "EOF")
}
