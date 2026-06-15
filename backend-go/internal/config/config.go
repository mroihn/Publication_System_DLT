package config

import "os"

type Config struct {
	Port                    string
	JWTSecret               string
	PinataJWT               string
	OperatorPrivateKey      string
	RPCURL                  string
	RegistryContractAddress string
}

func Load() *Config {
	return &Config{
		Port:                    getEnv("PORT", "3001"),
		JWTSecret:               getEnv("JWT_SECRET", "super-secret-jwt-key"),
		PinataJWT:               getEnv("PINATA_JWT", ""),
		OperatorPrivateKey:      getEnv("OPERATOR_PRIVATE_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"),
		RPCURL:                  getEnv("RPC_URL", "http://127.0.0.1:8545"),
		RegistryContractAddress: getEnv("REGISTRY_CONTRACT_ADDRESS", "0x0000000000000000000000000000000000000000"),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
