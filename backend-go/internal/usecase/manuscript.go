package usecase

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mroihn/ta-proj/backend-go/internal/repository"
)

type StorageService interface {
	UploadFile(data []byte, filename string) (string, error)
}

type ContractService interface {
	SubmitManuscript(cid, title, signature string, nonce uint64) (string, error)
	SubmitReview(msId uint64, reviewCid, comments, signature string, nonce uint64, verdict uint8) (string, error)
}

type ManuscriptUseCase struct {
	storage  StorageService
	contract ContractService
	reader   repository.ManuscriptReader
}

func NewManuscriptUseCase(storage StorageService, contract ContractService, reader repository.ManuscriptReader) *ManuscriptUseCase {
	return &ManuscriptUseCase{storage: storage, contract: contract, reader: reader}
}

type SubmitResult struct {
	CID    string `json:"cid"`
	TxHash string `json:"txHash"`
	Status string `json:"status"`
}

// UploadFile uploads raw file data to IPFS and returns the CID.
// Used by the two-step submit flow: upload first, then sign, then submit.
func (uc *ManuscriptUseCase) UploadFile(data []byte, filename string) (string, error) {
	return uc.storage.UploadFile(data, filename)
}

// SubmitOnChain submits a pre-uploaded manuscript to the smart contract.
// metadata must be the exact JSON string that was EIP-712 signed on the frontend.
func (uc *ManuscriptUseCase) SubmitOnChain(cid, metadata, signature string, nonce uint64) (*SubmitResult, error) {
	txHash, err := uc.contract.SubmitManuscript(cid, metadata, signature, nonce)
	if err != nil {
		return nil, err
	}
	fmt.Printf("Manuscript submitted: cid=%s txHash=%s\n", cid, txHash)
	return &SubmitResult{CID: cid, TxHash: txHash, Status: "CHECKING"}, nil
}

func (uc *ManuscriptUseCase) List(ctx context.Context) ([]repository.ManuscriptSummary, error) {
	if uc.reader == nil {
		return []repository.ManuscriptSummary{}, nil
	}
	return uc.reader.ListManuscripts(ctx)
}

func (uc *ManuscriptUseCase) GetByID(ctx context.Context, msId uint64) (*repository.ManuscriptDetail, error) {
	if uc.reader == nil {
		return nil, nil
	}
	return uc.reader.GetManuscriptByID(ctx, msId)
}

// SubmitReview uploads the review text to IPFS and submits the review on-chain.
// The reviewer's identity is proven via the EIP-712 signature.
func (uc *ManuscriptUseCase) SubmitReview(msId uint64, comments, signature string, nonce uint64, verdict uint8) (string, error) {
	verdictStr := map[uint8]string{0: "ACCEPT", 1: "REJECT", 2: "REVISE"}[verdict]
	payload, _ := json.Marshal(map[string]string{"comments": comments, "verdict": verdictStr})
	cid, err := uc.storage.UploadFile(payload, fmt.Sprintf("review-ms%d.json", msId))
	if err != nil {
		return "", fmt.Errorf("upload review to IPFS: %w", err)
	}
	fmt.Printf("Review uploaded to IPFS: cid=%s ms=%d\n", cid, msId)
	return uc.contract.SubmitReview(msId, cid, comments, signature, nonce, verdict)
}
