# Smart Contracts - Deployment and Test Guide

This guide explains how to compile, test, deploy, and upgrade the smart contracts in this folder using Hardhat.

## 1) Prerequisites

- Node.js 18+ and npm
- A Sepolia wallet funded with test ETH (for testnet deploy)

## 2) Install Dependencies

From the smartcontract folder:

```bash
npm install
```

## 3) Configure Environment Variables

Create a `.env` file in this folder and set the following values:

```bash
# Required for any network deploy
PRIVATE_KEY=0xYOUR_PRIVATE_KEY

# Required for Sepolia deploy
SEPOLIA_RPC_URL=https://rpc.ankr.com/eth_sepolia

# Optional (only for contract verification)
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
```

Notes:
- `PRIVATE_KEY` must include the `0x` prefix.
- The deploy script uses Polygon Amoy Chainlink addresses that are already set in the script.

## 4) Compile

```bash
npm run compile
```

## 5) Run Tests

```bash
npm test
```

The tests use a mock oracle to simulate Chainlink callbacks, so they run fully locally.

## 6) Deploy (Local Hardhat Network)

```bash
npm run deploy:local
```

This deploys to Hardhat's in-memory network and prints all contract addresses.

## 7) Deploy (Polygon Amoy)

```bash
npm run deploy:amoy
```

After deployment, the script prints a checklist of required post-deploy actions.

## 8) Post-Deploy Actions (Polygon Amoy)

After a successful testnet deploy:

1. Add the `ReviewOracle` contract as a VRF consumer.
2. Fund the VRF subscription with LINK.
3. Add the `ReviewOracle` contract as a Functions consumer.
4. Fund the Functions subscription with LINK.
5. Add reviewers via `ReviewOracle.addReviewer()`.
6. Grant `REVIEWER_ROLE` on `PublicationRegistry` to reviewer accounts.
7. Grant `RESEARCHER_ROLE` on `PublicationRegistry` to researcher accounts.

## 9) Upgrade PublicationRegistry (UUPS)

Set the proxy address and run the upgrade script:

```bash
PROXY_ADDRESS=0xYOUR_PROXY_ADDRESS npm run upgrade:amoy
```

The proxy address stays the same after the upgrade.

## 10) Common Scripts

```bash
npm run compile
npm test
npm run deploy:local
npm run deploy:amoy
npm run upgrade:amoy
```
