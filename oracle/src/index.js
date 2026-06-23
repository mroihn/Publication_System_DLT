const { ethers } = require("ethers");
const { ORACLE_KEY, ORACLE_ADDR } = require("./config");
const { createProvider } = require("./provider");
const { COMPETENCY, REVIEWER_REGISTRY, NUM_REVIEWERS } = require("./registry");
const { handlePlagiarismRequest } = require("./handlers/plagiarism");
const { handleReviewerSelection } = require("./handlers/reviewer");
const ORACLE_ABI = require("./abi/ReviewOracle.json");

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Publication System — Off-chain Oracle Operator");
  console.log("═══════════════════════════════════════════════════════\n");

  const provider = createProvider();
  const baseWallet = new ethers.Wallet(ORACLE_KEY, provider);
  const wallet   = new ethers.NonceManager(baseWallet);
  const contract = new ethers.Contract(ORACLE_ADDR, ORACLE_ABI, wallet);

  const operatorAddress = await wallet.getAddress();

  console.log(`[Oracle]   Operator address : ${operatorAddress}`);
  console.log(`[Oracle]   ReviewOracle     : ${ORACLE_ADDR}`);
  console.log(`[Oracle]   NUM_REVIEWERS    : ${NUM_REVIEWERS} (must be odd ≥ 3)\n`);

  console.log("[Registry] Hardcoded reviewer registry:");
  const byTier = { [COMPETENCY.HIGH]: [], [COMPETENCY.MEDIUM]: [], [COMPETENCY.LOW]: [] };
  for (const r of REVIEWER_REGISTRY) byTier[r.competency].push(r);
  for (const [tier, list] of Object.entries(byTier)) {
    console.log(`  ${tier.toUpperCase().padEnd(6)} (${list.length}): ${list.map(r => r.name).join(", ")}`);
  }
  console.log();

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
    handleReviewerSelection(contract, requestId, msId).catch(console.error);
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
