package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"math/big"
	"reflect"
	"strings"
	"time"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"

	"github.com/mroihn/ta-proj/backend-go/internal/indexer/blockchain"
	"github.com/mroihn/ta-proj/backend-go/internal/indexer/parser"
	idxrepo "github.com/mroihn/ta-proj/backend-go/internal/indexer/repository"
)

// getManuscriptABI covers only the getManuscript view, used to read back the
// on-chain metadata that ManuscriptSubmitted does not include in its event log.
const getManuscriptABI = `[{"inputs":[{"name":"msId","type":"uint256"}],"name":"getManuscript","outputs":[{"components":[{"name":"id","type":"uint256"},{"name":"author","type":"address"},{"name":"cid","type":"string"},{"name":"metadata","type":"string"},{"name":"status","type":"uint8"},{"name":"version","type":"uint256"},{"name":"plagiarismScore","type":"uint256"},{"name":"reviewers","type":"address[]"},{"name":"acceptCount","type":"uint256"},{"name":"rejectCount","type":"uint256"},{"name":"reviseCount","type":"uint256"},{"name":"reviewCount","type":"uint256"},{"name":"doi","type":"string"},{"name":"field","type":"string"}],"name":"","type":"tuple"}],"stateMutability":"view","type":"function"}]`

type ManuscriptSubmittedHandler struct {
	repo            idxrepo.IndexerRepository
	client          blockchain.BlockchainClient
	registryAddress string
}

func (h *ManuscriptSubmittedHandler) EventName() string { return "ManuscriptSubmitted" }

// fetchMetadata reads the manuscript's metadata directly from contract storage
// via getManuscript(msId), since ManuscriptSubmitted does not emit it. Always
// reads at the latest block (rather than the event's historical block) because
// the RPC provider's archive support returns corrupted data for older blocks;
// metadata is immutable after submission, so a latest-state read is equally
// correct and avoids that limitation entirely.
func (h *ManuscriptSubmittedHandler) fetchMetadata(ctx context.Context, msId uint64) string {
	if h.registryAddress == "" {
		return ""
	}
	parsedABI, err := abi.JSON(strings.NewReader(getManuscriptABI))
	if err != nil {
		log.Printf("ManuscriptSubmitted: parse getManuscript ABI: %v", err)
		return ""
	}
	data, err := parsedABI.Pack("getManuscript", new(big.Int).SetUint64(msId))
	if err != nil {
		log.Printf("ManuscriptSubmitted: pack getManuscript(%d): %v", msId, err)
		return ""
	}
	to := common.HexToAddress(h.registryAddress)
	msg := ethereum.CallMsg{To: &to, Data: data}
	var out []byte
	for attempt := 0; attempt < 3; attempt++ {
		out, err = h.client.CallContract(ctx, msg, nil)
		if err == nil {
			break
		}
		time.Sleep(time.Duration(attempt+1) * 500 * time.Millisecond)
	}
	if err != nil {
		log.Printf("ManuscriptSubmitted: call getManuscript(%d): %v", msId, err)
		return ""
	}
	vals, err := parsedABI.Unpack("getManuscript", out)
	if err != nil || len(vals) == 0 {
		log.Printf("ManuscriptSubmitted: unpack getManuscript(%d): %v", msId, err)
		return ""
	}
	field := reflect.ValueOf(vals[0]).FieldByName("Metadata")
	if !field.IsValid() {
		return ""
	}
	return field.String()
}

func (h *ManuscriptSubmittedHandler) Handle(ctx context.Context, tx *sql.Tx, event *parser.ParsedEvent) error {
	msId := parser.BigIntArg(event.Args, "msId").Uint64()
	cid := parser.StringArg(event.Args, "cid")
	author := parser.AddressArg(event.Args, "author").Hex()

	var submittedAt *time.Time
	header, err := h.client.HeaderByHash(ctx, event.Raw.BlockHash)
	if err != nil {
		log.Printf("ManuscriptSubmitted: could not fetch block header for hash %s (msId=%d): %v — timestamp will be null",
			event.Raw.BlockHash.Hex(), msId, err)
	} else {
		t := time.Unix(int64(header.Time), 0).UTC()
		submittedAt = &t
	}

	metadata := h.fetchMetadata(ctx, msId)

	if err := h.repo.UpsertManuscript(ctx, tx, idxrepo.ManuscriptRow{
		MsId:          msId,
		AuthorAddress: author,
		CID:           cid,
		Metadata:      metadata,
		Status:        "CHECKING",
		Version:       1,
		TxHash:        event.Raw.TxHash.Hex(),
		BlockNumber:   event.Raw.BlockNumber,
		SubmittedAt:   submittedAt,
		JournalID:     journalIDFromMetadata(metadata),
	}); err != nil {
		return err
	}

	return h.repo.AssignEditor(ctx, tx, msId)
}

// journalIDFromMetadata reads the journal the author picked out of the metadata
// JSON that was EIP-712 signed and stored on-chain. Manuscripts submitted before
// journals existed (or with unparsable metadata) simply have no journal.
func journalIDFromMetadata(metadata string) *int64 {
	var parsed struct {
		Journal struct {
			ID *int64 `json:"id"`
		} `json:"journal"`
	}
	if err := json.Unmarshal([]byte(metadata), &parsed); err != nil {
		return nil
	}
	return parsed.Journal.ID
}
