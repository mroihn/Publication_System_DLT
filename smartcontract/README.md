# Smart Contracts - Deployment & Oracle Setup Guide

This guide provides a comprehensive, step-by-step walk-through for deploying the Publication System smart contracts and configuring the custom off-chain Oracle on the **Sepolia Testnet**.

---

## 1. Prerequisites

Before you begin, ensure you have the following:
- **Node.js** (v18+) and npm installed.
- A **Web3 Wallet** (like MetaMask) configured for the **Sepolia Testnet**.
- **Sepolia Testnet ETH**: You need Sepolia ETH to pay for deployment gas fees. You can get testnet ETH from [Sepolia PoW Faucet](https://sepolia-faucet.pk910.de/) or [Alchemy Faucet](https://sepoliafaucet.com/).

---

## 2. Install Dependencies

Navigate to the `smartcontract` folder and install the required Node modules:

```bash
cd smartcontract
npm install
```

---

## 3. Configure Environment Variables

Create a `.env` file in the `smartcontract` folder:

```bash
cp .env.example .env
```

Edit `.env` and set the following required values:

```env
# Your wallet's private key (Must include the 0x prefix)
PRIVATE_KEY=0xYOUR_PRIVATE_KEY

# RPC URL for Sepolia Testnet
SEPOLIA_RPC_URL=https://rpc.ankr.com/eth_sepolia

# Optional: Etherscan API key for verifying contracts
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
```

> **Note**: Do not commit your `.env` file to version control. Keep your private key safe!

---

## 4. Compile the Contracts

Compile the Solidity smart contracts to ensure there are no syntax errors and to generate the ABI artifacts.

```bash
npx hardhat compile
```

You can optionally run tests to verify local functionality before deploying:
```bash
npx hardhat test
```

---

## 5. Deploy the Smart Contracts (Sepolia)

Run the deployment script targeting the Sepolia network. 

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

**Deployment Order:**
1. `JournalToken` (ERC-20)
2. `DOIToken` (ERC-721)
3. `ReviewOracle` (Custom off-chain Oracle contract)
4. `PublicationRegistry` (UUPS Upgradeable Proxy)

The deploy script automatically grants the necessary `MINTER_ROLE` to the registry and links the registry to the oracle.

**Important**: Save the deployed contract addresses printed in the console. You will need them to interact with the system!

---

## 6. Custom Off-Chain Oracle Setup

This project uses a **custom off-chain Oracle** rather than Chainlink. The `ReviewOracle.sol` contract acts as an on-chain interface, while the actual logic (e.g., plagiarism checking and tiered random reviewer selection) must be run off-chain by an authorized operator.

### How it works:
1. The `PublicationRegistry` calls the `ReviewOracle` to request a plagiarism check or reviewer selection.
2. The `ReviewOracle` emits an event (`PlagiarismCheckRequested` or `ReviewerSelectionRequested`).
3. Your **off-chain backend service** listens for these events.
4. The off-chain service processes the request (e.g., calling an AI plagiarism API or querying a database of reviewers).
5. The off-chain service calls `fulfillPlagiarismCheck()` or `fulfillReviewerSelection()` back on the `ReviewOracle` contract.

### Operator Permissions:
The deployer of the `ReviewOracle` is automatically granted the `ORACLE_ROLE`. The wallet address running your off-chain listener **must** have this role to submit fulfillment transactions.

---

## 7. Post-Deploy Configuration (On-Chain Actions)

After your contracts are deployed, you must configure internal permissions before researchers and reviewers can use the platform.

1. **Add Reviewers to the Oracle:**
   Call `ReviewOracle.addReviewer(reviewerAddress)` for each reviewer you want the oracle to be able to randomly select. *(If you implemented the tier system entirely off-chain, you might skip this depending on your backend logic).*

2. **Assign Registry Roles:**
   The `PublicationRegistry` uses Access Control. You must grant specific roles using the deploying address (which holds the `DEFAULT_ADMIN_ROLE`).
   - **Reviewer Role:** Grant `REVIEWER_ROLE` to your whitelisted reviewer addresses so they can submit critiques.
   - **Researcher Role:** Grant `RESEARCHER_ROLE` to the authors who will submit manuscripts.

---

## 8. Upgrading the Contract (Optional)

The `PublicationRegistry` is deployed as a UUPS Upgradeable proxy. If you need to upgrade the contract logic in the future without losing state:

1. Update the contract code in `contracts/PublicationRegistry.sol`.
2. Provide your proxy address and run the upgrade script (assuming you have an `upgrade.js` script adapted for Sepolia):

```bash
PROXY_ADDRESS=0xYOUR_PROXY_ADDRESS npx hardhat run scripts/upgrade.js --network sepolia
```

---

## 9. Verifying Contracts on Etherscan

To verify your deployed contracts on Etherscan (which allows others to read the source code and interact via the block explorer), ensure your `ETHERSCAN_API_KEY` is set in the `.env` file.

Run the appropriate verify command for each contract. Replace the `<ADDRESS>` placeholders with your actual deployed contract addresses:

**1. JournalToken** (Requires the initial supply argument `1000000` passed during deploy):
```bash
npx hardhat verify --network sepolia <JOURNAL_TOKEN_ADDRESS> 1000000
```

**2. DOIToken** (No constructor arguments):
```bash
npx hardhat verify --network sepolia <DOI_TOKEN_ADDRESS>
```

**3. ReviewOracle** (No constructor arguments):
```bash
npx hardhat verify --network sepolia <REVIEW_ORACLE_ADDRESS>
```

**4. PublicationRegistry** (UUPS Proxy)
When verifying a UUPS proxy deployed via Hardhat Upgrades, the plugin handles most of it automatically. You generally don't need to pass the initializer arguments to the verify command. Try running this on the proxy address:
```bash
npx hardhat verify --network sepolia <PUBLICATION_REGISTRY_PROXY_ADDRESS>
```
