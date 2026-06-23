package service

import (
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

const (
	mockTxHash  = "0xMockTxHashabcdef1234567890abcdef1234567890abcdef1234567890abcdef"
	zeroAddress = "0x0000000000000000000000000000000000000000"

	registryABIJSON = `[
		{"inputs":[{"name":"cid","type":"string"},{"name":"metadata","type":"string"}],"name":"submitManuscript","outputs":[],"stateMutability":"nonpayable","type":"function"},
		{"inputs":[{"name":"msId","type":"uint256"},{"name":"reviewCid","type":"string"},{"name":"verdict","type":"uint8"}],"name":"submitReview","outputs":[],"stateMutability":"nonpayable","type":"function"},

		{"type":"error","name":"InvalidState","inputs":[{"name":"msId","type":"uint256"},{"name":"expected","type":"uint8"},{"name":"actual","type":"uint8"}]},
		{"type":"error","name":"NotAuthor","inputs":[{"name":"msId","type":"uint256"},{"name":"caller","type":"address"}]},
		{"type":"error","name":"NotAssignedReviewer","inputs":[{"name":"msId","type":"uint256"},{"name":"caller","type":"address"}]},
		{"type":"error","name":"AlreadyReviewed","inputs":[{"name":"msId","type":"uint256"},{"name":"reviewer","type":"address"}]},
		{"type":"error","name":"InsufficientAllowance","inputs":[{"name":"required","type":"uint256"},{"name":"actual","type":"uint256"}]},
		{"type":"error","name":"ManuscriptNotFound","inputs":[{"name":"msId","type":"uint256"}]},
		{"type":"error","name":"PlagiarismThresholdExceeded","inputs":[{"name":"msId","type":"uint256"},{"name":"score","type":"uint256"}]},
		{"type":"error","name":"TransferFailed","inputs":[]},
		{"type":"error","name":"ZeroAddress","inputs":[]}
	]`
)

type EthereumService struct {
	rpcURL          string
	privateKey      *ecdsa.PrivateKey
	contractAddress string
}

func NewEthereumService(rpcURL, privateKeyHex, contractAddress string) *EthereumService {
	var key *ecdsa.PrivateKey
	if pk := strings.TrimPrefix(privateKeyHex, "0x"); pk != "" {
		var err error
		key, err = crypto.HexToECDSA(pk)
		if err != nil {
			fmt.Printf("Warning: invalid OPERATOR_PRIVATE_KEY: %v — on-chain submission disabled\n", err)
		}
	}
	return &EthereumService{
		rpcURL:          rpcURL,
		privateKey:      key,
		contractAddress: contractAddress,
	}
}

func (s *EthereumService) sendTx(methodName string, args ...any) (string, error) {
	if s.contractAddress == "" || s.contractAddress == zeroAddress {
		fmt.Printf("%s: REGISTRY_CONTRACT_ADDRESS not configured, returning mock tx\n", methodName)
		return mockTxHash, nil
	}
	if s.privateKey == nil {
		fmt.Printf("%s: OPERATOR_PRIVATE_KEY not configured, returning mock tx\n", methodName)
		return mockTxHash, nil
	}

	client, err := ethclient.Dial(s.rpcURL)
	if err != nil {
		return "", fmt.Errorf("RPC connection failed: %w", err)
	}
	defer client.Close()

	parsedABI, err := abi.JSON(strings.NewReader(registryABIJSON))
	if err != nil {
		return "", fmt.Errorf("ABI parse: %w", err)
	}

	data, err := parsedABI.Pack(methodName, args...)
	if err != nil {
		return "", fmt.Errorf("ABI encode %s: %w", methodName, err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pubKey := s.privateKey.Public().(*ecdsa.PublicKey)
	fromAddress := crypto.PubkeyToAddress(*pubKey)

	nonce, err := client.PendingNonceAt(ctx, fromAddress)
	if err != nil {
		return "", fmt.Errorf("get nonce: %w", err)
	}
	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		return "", fmt.Errorf("get gas price: %w", err)
	}
	chainID, err := client.NetworkID(ctx)
	if err != nil {
		return "", fmt.Errorf("get chain ID: %w", err)
	}

	toAddr := common.HexToAddress(s.contractAddress)
	signer := types.NewEIP155Signer(chainID)

	callMsg := ethereum.CallMsg{From: fromAddress, To: &toAddr, Data: data}
	gasLimit := uint64(400000)
	if estimated, estErr := client.EstimateGas(ctx, callMsg); estErr == nil {
		gasLimit = estimated * 12 / 10 // 20% buffer
	} else {
		reason := revertReason(ctx, client, fromAddress, toAddr, data, nil)
		return "", fmt.Errorf("%s", reason)
	}

	var signed *types.Transaction
	for attempt := 0; attempt < 4; attempt++ {
		rawTx := types.NewTransaction(nonce, toAddr, big.NewInt(0), gasLimit, gasPrice, data)
		signed, err = types.SignTx(rawTx, signer, s.privateKey)
		if err != nil {
			return "", fmt.Errorf("sign tx: %w", err)
		}
		sendErr := client.SendTransaction(ctx, signed)
		if sendErr == nil {
			break
		}
		if !strings.Contains(sendErr.Error(), "replacement transaction underpriced") {
			return "", fmt.Errorf("broadcast tx: %w", sendErr)
		}
		gasPrice = new(big.Int).Mul(gasPrice, big.NewInt(120))
		gasPrice = new(big.Int).Div(gasPrice, big.NewInt(100))
		if attempt == 3 {
			return "", fmt.Errorf("broadcast tx: %w", sendErr)
		}
		time.Sleep(2 * time.Second)
	}

	receipt, err := bind.WaitMined(ctx, client, signed)
	if err != nil {
		return signed.Hash().Hex(), fmt.Errorf("tx broadcast succeeded but mining confirmation timed out: %w", err)
	}

	if receipt.Status == types.ReceiptStatusFailed {
		reason := revertReason(ctx, client, fromAddress, toAddr, data, receipt.BlockNumber)
		return "", fmt.Errorf("%s", reason)
	}

	return signed.Hash().Hex(), nil
}

func revertReason(ctx context.Context, client *ethclient.Client, from, to common.Address, data []byte, blockNum *big.Int) string {
	msg := ethereum.CallMsg{From: from, To: &to, Data: data}
	_, callErr := client.CallContract(ctx, msg, blockNum)
	if callErr == nil {
		return "transaction reverted (simulation succeeded — possibly a gas issue)"
	}

	type dataError interface{ ErrorData() any }
	if de, ok := callErr.(dataError); ok {
		if raw, ok := de.ErrorData().(string); ok && strings.HasPrefix(raw, "0x") {
			payload := common.FromHex(raw)

			if reason, err := abi.UnpackRevert(payload); err == nil {
				return reason
			}

			if len(payload) >= 4 {
				if msg := decodeCustomError(payload); msg != "" {
					return msg
				}
			}

			return fmt.Sprintf("contract error (raw): %s", raw)
		}
	}

	return callErr.Error()
}

func decodeCustomError(payload []byte) string {
	parsedABI, err := abi.JSON(strings.NewReader(registryABIJSON))
	if err != nil {
		return ""
	}
	var selector [4]byte
	copy(selector[:], payload[:4])
	for _, abiErr := range parsedABI.Errors {
		if [4]byte(abiErr.ID[:4]) == selector {
			if len(abiErr.Inputs) == 0 {
				return abiErr.Name
			}
			vals, err := abiErr.Inputs.Unpack(payload[4:])
			if err != nil {
				return abiErr.Name
			}
			parts := make([]string, len(abiErr.Inputs))
			for i, inp := range abiErr.Inputs {
				parts[i] = fmt.Sprintf("%s=%v", inp.Name, vals[i])
			}
			return fmt.Sprintf("%s(%s)", abiErr.Name, strings.Join(parts, ", "))
		}
	}
	return ""
}

func (s *EthereumService) SubmitManuscript(cid, title string) (string, error) {
	metadata, _ := json.Marshal(map[string]string{"title": title})
	return s.sendTx("submitManuscript", cid, string(metadata))
}

func (s *EthereumService) SubmitReview(msId uint64, reviewCid string, verdict uint8) (string, error) {
	return s.sendTx("submitReview", new(big.Int).SetUint64(msId), reviewCid, verdict)
}
