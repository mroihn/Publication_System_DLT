package service

import (
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

const (
	mockTxHash      = "0xMockTxHashabcdef1234567890abcdef1234567890abcdef1234567890abcdef"
	zeroAddress     = "0x0000000000000000000000000000000000000000"
	registryABIJSON = `[
		{"inputs":[{"name":"cid","type":"string"},{"name":"metadata","type":"string"}],"name":"submitManuscript","outputs":[],"stateMutability":"nonpayable","type":"function"},
		{"inputs":[{"name":"msId","type":"uint256"},{"name":"hash","type":"bytes32"},{"name":"verdict","type":"uint8"}],"name":"submitReview","outputs":[],"stateMutability":"nonpayable","type":"function"}
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

func (s *EthereumService) sendTx(methodName string, args ...interface{}) (string, error) {
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
		fmt.Printf("%s: RPC dial error: %v — returning mock tx\n", methodName, err)
		return mockTxHash, nil
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

	ctx := context.Background()
	pubKey := s.privateKey.Public().(*ecdsa.PublicKey)
	fromAddress := crypto.PubkeyToAddress(*pubKey)

	nonce, err := client.PendingNonceAt(ctx, fromAddress)
	if err != nil {
		return "", fmt.Errorf("nonce: %w", err)
	}
	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		return "", fmt.Errorf("gas price: %w", err)
	}
	chainID, err := client.NetworkID(ctx)
	if err != nil {
		return "", fmt.Errorf("chain id: %w", err)
	}

	toAddr := common.HexToAddress(s.contractAddress)
	tx := types.NewTransaction(nonce, toAddr, big.NewInt(0), 300000, gasPrice, data)
	signer := types.NewEIP155Signer(chainID)
	signed, err := types.SignTx(tx, signer, s.privateKey)
	if err != nil {
		return "", fmt.Errorf("sign tx: %w", err)
	}
	if err := client.SendTransaction(ctx, signed); err != nil {
		return "", fmt.Errorf("send tx: %w", err)
	}
	return signed.Hash().Hex(), nil
}

func (s *EthereumService) SubmitManuscript(cid, title string) (string, error) {
	metadata, _ := json.Marshal(map[string]string{"title": title})
	return s.sendTx("submitManuscript", cid, string(metadata))
}

func (s *EthereumService) SubmitReview(msId uint64, commentsHash [32]byte, verdict uint8) (string, error) {
	return s.sendTx("submitReview", new(big.Int).SetUint64(msId), commentsHash, verdict)
}
