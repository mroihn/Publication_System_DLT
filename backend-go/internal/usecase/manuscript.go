package usecase

import (
	"context"
	"fmt"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/mroihn/ta-proj/backend-go/internal/repository"
)

type StorageService interface {
	UploadFile(data []byte, filename string) (string, error)
}

type ContractService interface {
	SubmitManuscript(cid, title string) (string, error)
	SubmitReview(msId uint64, commentsHash [32]byte, verdict uint8) (string, error)
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

func (uc *ManuscriptUseCase) Submit(fileData []byte, filename, title string) (*SubmitResult, error) {
	cid, err := uc.storage.UploadFile(fileData, filename)
	if err != nil {
		return nil, err
	}

	txHash, err := uc.contract.SubmitManuscript(cid, title)
	if err != nil {
		return nil, err
	}

	fmt.Printf("Manuscript submitted with CID: %s and txHash: %s\n", cid, txHash)
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

func (uc *ManuscriptUseCase) SubmitReview(msId uint64, comments string, verdict uint8) (string, error) {
	hash := crypto.Keccak256Hash([]byte(comments))
	var b32 [32]byte
	copy(b32[:], hash.Bytes())
	return uc.contract.SubmitReview(msId, b32, verdict)
}
