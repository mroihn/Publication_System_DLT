package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
)

const mockCID = "QmMockHash1234567890abcdef1234567890abcdef123"

type PinataService struct {
	jwt string
}

func NewPinataService(jwt string) *PinataService {
	return &PinataService{jwt: jwt}
}

func (s *PinataService) UploadFile(data []byte, filename string) (string, error) {
	if s.jwt == "" {
		fmt.Println("PINATA_JWT not configured. Returning mock CID.")
		return mockCID, nil
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return mockCID, nil
	}
	if _, err = io.Copy(part, bytes.NewReader(data)); err != nil {
		return mockCID, nil
	}
	writer.Close()

	req, err := http.NewRequest("POST", "https://api.pinata.cloud/pinning/pinFileToIPFS", body)
	if err != nil {
		return mockCID, nil
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+s.jwt)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Printf("Error uploading to Pinata: %v\n", err)
		return mockCID, nil
	}
	defer resp.Body.Close()

	var result struct {
		IpfsHash string `json:"IpfsHash"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || result.IpfsHash == "" {
		return mockCID, nil
	}
	return result.IpfsHash, nil
}
