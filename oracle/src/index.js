const { ethers } = require("ethers");
const { ORACLE_KEY, ORACLE_ADDR, REGISTRY_ADDR } = require("./config");
const { createProvider } = require("./provider");
const { handlePlagiarismRequest } = require("./handlers/plagiarism");
const { handleReviewerSelection } = require("./handlers/reviewer");
const ORACLE_ABI = require("./abi/ReviewOracle.json");

// Minimal read-only ABI to fetch the editor-assigned field for a manuscript.
const REGISTRY_READ_ABI = [
  "function getField(uint256 msId) view returns (string)",
];

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Publication System — Off-chain Oracle Operator");
  console.log("═══════════════════════════════════════════════════════\n");

  const provider = createProvider();
  const baseWallet = new ethers.Wallet(ORACLE_KEY, provider);
  const wallet   = new ethers.NonceManager(baseWallet);
  const contract = new ethers.Contract(ORACLE_ADDR, ORACLE_ABI, wallet);

  // Read-only registry handle used to fetch the editor-assigned field per manuscript.
  const registry = REGISTRY_ADDR
    ? new ethers.Contract(REGISTRY_ADDR, REGISTRY_READ_ABI, provider)
    : null;

  const operatorAddress = await wallet.getAddress();

  console.log(`[Oracle]   Operator address : ${operatorAddress}`);
  console.log(`[Oracle]   ReviewOracle     : ${ORACLE_ADDR}`);
  console.log(`[Oracle]   Registry         : ${REGISTRY_ADDR || "(not set — field lookup disabled)"}`);
  console.log("[Oracle]   Reviewer selection: field-based via backend\n");

  const balance = await provider.getBalance(operatorAddress);
  console.log(`[Oracle]   Balance          : ${ethers.formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    console.warn("[WARN] Operator has zero balance — transactions will fail!");
  }

  console.log("[Listen]  Subscribing to PlagiarismCheckRequested events...");
  contract.on("PlagiarismCheckRequested", async (requestId, msId, cid) => {
    await wallet.reset();
    handlePlagiarismRequest(contract, requestId, msId, cid).catch(console.error);
  });

  console.log("[Listen]  Subscribing to ReviewerSelectionRequested events...\n");
  contract.on("ReviewerSelectionRequested", async (requestId, msId) => {
    await wallet.reset();
    // Look up the editor-assigned field so the backend can pick matching reviewers.
    let field = "";
    try {
      if (registry) field = await registry.getField(msId);
    } catch (err) {
      console.error(`[Reviewer][Error] getField(${msId}) failed:`, err.message);
    }
    handleReviewerSelection(contract, requestId, msId, field).catch(console.error);
  });

  console.log("[Ready]   Oracle operator is running. Press Ctrl+C to stop.\n");

  const shutdown = () => {
    console.log("\n[Oracle] Shutting down...");
    contract.removeAllListeners();
    if (provider.destroy) provider.destroy();
    process.exit(0);
  };
  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[Fatal]", error);
  process.exit(1);
});
