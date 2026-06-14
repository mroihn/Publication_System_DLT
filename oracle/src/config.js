require("dotenv").config();

const REQUIRED_ENV = ["ORACLE_PRIVATE_KEY", "REVIEW_ORACLE_ADDRESS"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`ERROR: Missing required environment variable: ${key}`);
    console.error("Copy .env.example → .env and fill in the values.");
    process.exit(1);
  }
}

module.exports = {
  RPC_WSS:       process.env.SEPOLIA_RPC_WSS,
  RPC_HTTP:      process.env.SEPOLIA_RPC_URL || "https://rpc.ankr.com/eth_sepolia",
  ORACLE_KEY:    process.env.ORACLE_PRIVATE_KEY,
  ORACLE_ADDR:   process.env.REVIEW_ORACLE_ADDRESS,
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL_MS || "5000", 10),
};
