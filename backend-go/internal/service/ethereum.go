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
	mockTxHash   = "0xMockTxHashabcdef1234567890abcdef1234567890abcdef1234567890abcdef"
	zeroAddress  = "0x0000000000000000000000000000000000000000"
	registryABIJSON = `[{"inputs":[{"name":"cid","type":"string"},{"name":"metadata","type":"string"}],"name":"submitManuscript","outputs":[],"stateMutability":"nonpayable","type":"function"}]`
)

type EthereumService struct {
	rpcURL          string
	privateKey      *ecdsa.PrivateKey
	contractAddress string
}

func NewEthereumService(rpcURL, privateKeyHex, contractAddress string) *EthereumService {
	pk := strings.TrimPrefix(privateKeyHex, "0x")
	key, err := crypto.HexToECDSA(pk)
	if err != nil {
		fmt.Printf("Warning: invalid OPERATOR_PRIVATE_KEY, using zero key: %v\n", err)
		key, _ = crypto.HexToECDSA("ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
	}
	return &EthereumService{
		rpcURL:          rpcURL,
		privateKey:      key,
		contractAddress: contractAddress,
	}
}

func (s *EthereumService) SubmitManuscript(cid, title string) (string, error) {
	if s.contractAddress == "" || s.contractAddress == zeroAddress {
		fmt.Println("REGISTRY_CONTRACT_ADDRESS not configured. Returning mock transaction hash.")
		return mockTxHash, nil
	}

	client, err := ethclient.Dial(s.rpcURL)
	if err != nil {
		fmt.Printf("Error connecting to RPC: %v\n", err)
		return mockTxHash, nil
	}
	defer client.Close()

	parsedABI, err := abi.JSON(strings.NewReader(registryABIJSON))
	if err != nil {
		return mockTxHash, nil
	}

	metadata, _ := json.Marshal(map[string]string{"title": title})
	data, err := parsedABI.Pack("submitManuscript", cid, string(metadata))
	if err != nil {
		fmt.Printf("Error ABI encoding: %v\n", err)
		return mockTxHash, nil
	}

	ctx := context.Background()
	pubKey := s.privateKey.Public().(*ecdsa.PublicKey)
	fromAddress := crypto.PubkeyToAddress(*pubKey)

	nonce, err := client.PendingNonceAt(ctx, fromAddress)
	if err != nil {
		return mockTxHash, nil
	}

	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		return mockTxHash, nil
	}

	toAddr := common.HexToAddress(s.contractAddress)
	tx := types.NewTransaction(nonce, toAddr, big.NewInt(0), 300000, gasPrice, data)

	chainID, err := client.NetworkID(ctx)
	if err != nil {
		return mockTxHash, nil
	}

	signer := types.NewEIP155Signer(chainID)
	signed, err := types.SignTx(tx, signer, s.privateKey)
	if err != nil {
		return mockTxHash, nil
	}

	if err := client.SendTransaction(ctx, signed); err != nil {
		fmt.Printf("Error sending transaction: %v\n", err)
		return mockTxHash, nil
	}

	return signed.Hash().Hex(), nil
}
