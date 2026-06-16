package parser

import (
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

type ParsedEvent struct {
	Name     string
	Contract string // "registry" | "oracle" | "doitoken"
	Args     map[string]interface{}
	Raw      types.Log
}

type EventParser interface {
	Parse(log types.Log) (*ParsedEvent, error)
}

type contractEntry struct {
	key     string
	addr    string
	parsedABI abi.ABI
	topics  map[common.Hash]abi.Event // topic[0] → event
}

type MultiContractParser struct {
	contracts []*contractEntry
}

func NewMultiContractParser(registryAddr, oracleAddr, doiTokenAddr string) (*MultiContractParser, error) {
	specs := []struct {
		key     string
		addr    string
		abiJSON string
	}{
		{"registry", registryAddr, RegistryABI},
		{"oracle", oracleAddr, OracleABI},
		{"doitoken", doiTokenAddr, DOITokenABI},
	}

	p := &MultiContractParser{}
	for _, s := range specs {
		parsed, err := abi.JSON(strings.NewReader(s.abiJSON))
		if err != nil {
			return nil, fmt.Errorf("parse ABI for %s: %w", s.key, err)
		}
		entry := &contractEntry{
			key:       s.key,
			addr:      strings.ToLower(s.addr),
			parsedABI: parsed,
			topics:    make(map[common.Hash]abi.Event),
		}
		for _, ev := range parsed.Events {
			entry.topics[ev.ID] = ev
		}
		p.contracts = append(p.contracts, entry)
	}
	return p, nil
}

func (p *MultiContractParser) Parse(log types.Log) (*ParsedEvent, error) {
	if len(log.Topics) == 0 {
		return nil, nil
	}
	logAddr := strings.ToLower(log.Address.Hex())
	for _, c := range p.contracts {
		if c.addr != logAddr {
			continue
		}
		ev, ok := c.topics[log.Topics[0]]
		if !ok {
			continue
		}
		args := make(map[string]interface{})
		if err := c.parsedABI.UnpackIntoMap(args, ev.Name, log.Data); err != nil {
			return nil, fmt.Errorf("unpack %s.%s: %w", c.key, ev.Name, err)
		}
		// Decode indexed arguments — ParseTopicsIntoMap expects only indexed fields.
		var indexedArgs abi.Arguments
		for _, arg := range ev.Inputs {
			if arg.Indexed {
				indexedArgs = append(indexedArgs, arg)
			}
		}
		if err := abi.ParseTopicsIntoMap(args, indexedArgs, log.Topics[1:]); err != nil {
			return nil, fmt.Errorf("parse topics %s.%s: %w", c.key, ev.Name, err)
		}
		return &ParsedEvent{
			Name:     ev.Name,
			Contract: c.key,
			Args:     args,
			Raw:      log,
		}, nil
	}
	return nil, nil
}

// Argument helpers used by event handlers.

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
