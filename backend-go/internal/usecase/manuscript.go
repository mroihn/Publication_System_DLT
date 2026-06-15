package usecase

import "fmt"

type StorageService interface {
	UploadFile(data []byte, filename string) (string, error)
}

type ContractService interface {
	SubmitManuscript(cid, title string) (string, error)
}

type ManuscriptUseCase struct {
	storage  StorageService
	contract ContractService
}

func NewManuscriptUseCase(storage StorageService, contract ContractService) *ManuscriptUseCase {
	return &ManuscriptUseCase{storage: storage, contract: contract}
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
