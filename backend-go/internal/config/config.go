package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port                    string
	JWTSecret               string
	PinataJWT               string
	OperatorPrivateKey      string
	RPCURL                  string
	RegistryContractAddress string
	OracleSharedSecret      string

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	ReviewOracleContractAddress string
	DOITokenContractAddress     string
	IndexerStartBlock           uint64
	IndexerPollIntervalMs       int
	IndexerRPCWSS               string
}

func Load() *Config {
	return &Config{
		Port:                    getEnv("PORT", "3001"),
		JWTSecret:               getEnv("JWT_SECRET", ""),
		PinataJWT:               getEnv("PINATA_JWT", ""),
		OperatorPrivateKey:      getEnv("OPERATOR_PRIVATE_KEY", ""),
		RPCURL:                  getEnv("RPC_URL", "http://127.0.0.1:8545"),
		RegistryContractAddress: getEnv("REGISTRY_CONTRACT_ADDRESS", "0x0000000000000000000000000000000000000000"),
		OracleSharedSecret:      getEnv("ORACLE_SHARED_SECRET", ""),

		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: getEnv("DB_PASSWORD", "postgres"),
		DBName:     getEnv("DB_NAME", "publish_db"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),

		ReviewOracleContractAddress: getEnv("REVIEW_ORACLE_CONTRACT_ADDRESS", "0x0000000000000000000000000000000000000000"),
		DOITokenContractAddress:     getEnv("DOI_TOKEN_CONTRACT_ADDRESS", "0x0000000000000000000000000000000000000000"),
		IndexerStartBlock:           parseUint64(getEnv("INDEXER_START_BLOCK", "0")),
		IndexerPollIntervalMs:       parseInt(getEnv("INDEXER_POLL_INTERVAL_MS", "5000")),
		IndexerRPCWSS:               getEnv("INDEXER_RPC_WSS", ""),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func parseUint64(s string) uint64 {
	v, _ := strconv.ParseUint(s, 10, 64)
	return v
}

func parseInt(s string) int {
	v, _ := strconv.Atoi(s)
	return v
}
