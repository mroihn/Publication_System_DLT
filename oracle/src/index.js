/**
 * Off-chain Oracle Operator
 *
 * Listens for `PlagiarismCheckRequested` events emitted by the ReviewOracle
 * contract, runs a plagiarism check (via API or mock), and calls
 * `fulfillPlagiarismCheck(requestId, score)` on-chain.
 *
 * Usage:
 *   1. Copy .env.example → .env and fill in values
 *   2. npm install
 *   3. npm start
 */

require("dotenv").config();
const { ethers } = require("ethers");
const { checkPlagiarism } = require("./plagiarism");
const ORACLE_ABI = require("./abi/ReviewOracle.json");

// ─────────────────────────── Configuration ────────────────────────────────────

const REQUIRED_ENV = ["ORACLE_PRIVATE_KEY", "REVIEW_ORACLE_ADDRESS"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`ERROR: Missing required environment variable: ${key}`);
    console.error("Copy .env.example → .env and fill in the values.");
    process.exit(1);
  }
}

const RPC_WSS = process.env.AMOY_RPC_WSS;
const RPC_HTTP =
  process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology/";
const ORACLE_KEY = process.env.ORACLE_PRIVATE_KEY;
const ORACLE_ADDR = process.env.REVIEW_ORACLE_ADDRESS;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);

// ──────────────────────────── Provider Setup ──────────────────────────────────

/**
 * Create the best available provider.
 * Prefers WebSocket for real-time event streaming; falls back to HTTP polling.
 */
function createProvider() {
  if (RPC_WSS) {
    console.log(`[Provider] Connecting via WebSocket: ${RPC_WSS}`);
    return new ethers.WebSocketProvider(RPC_WSS);
  }
  console.log(
    `[Provider] No WSS URL — using HTTP polling (${POLL_INTERVAL}ms): ${RPC_HTTP}`
  );
  return new ethers.JsonRpcProvider(RPC_HTTP, undefined, {
    pollingInterval: POLL_INTERVAL,
  });
}

// ─────────────────────── In-flight Tracking ──────────────────────────────────

/** Set of request IDs currently being processed (prevents double-fulfillment). */
const inflight = new Set();

// ──────────────────────────── Event Handler ───────────────────────────────────

/**
 * Handle a PlagiarismCheckRequested event.
 * @param {ethers.Contract} contract — The ReviewOracle contract instance (with signer).
 * @param {bigint} requestId
 * @param {bigint} msId
 * @param {string} cid
 */
async function handleRequest(contract, requestId, msId, cid) {
  const reqKey = requestId.toString();

  // Guard: already processing
  if (inflight.has(reqKey)) {
    console.log(`[Skip] Request ${reqKey} already in-flight`);
    return;
  }

  // Guard: already fulfilled on-chain
  try {
    const fulfilled = await contract.requestFulfilled(requestId);
    if (fulfilled) {
      console.log(`[Skip] Request ${reqKey} already fulfilled on-chain`);
      return;
    }
  } catch {
    // View call failed — proceed anyway
  }

  inflight.add(reqKey);
  console.log(
    `\n[Request] ID: ${reqKey} | Manuscript: ${msId} | CID: ${cid}`
  );

  try {
    // 1. Run plagiarism check
    const score = await checkPlagiarism(cid);
    console.log(`[Result]  Score: ${score}/100`);

    // 2. Submit fulfillment transaction
    console.log("[Tx]      Sending fulfillPlagiarismCheck...");
    const tx = await contract.fulfillPlagiarismCheck(requestId, score);
    console.log(`[Tx]      Hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(
      `[Tx]      Confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`
    );
  } catch (error) {
    console.error(`[Error]   Failed to fulfill request ${reqKey}:`, error.message);
  } finally {
    inflight.delete(reqKey);
  }
}

// ──────────────────────────── Main Loop ───────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Publication System — Off-chain Oracle Operator");
  console.log("═══════════════════════════════════════════════════\n");

  const provider = createProvider();
  const wallet = new ethers.Wallet(ORACLE_KEY, provider);
  const contract = new ethers.Contract(ORACLE_ADDR, ORACLE_ABI, wallet);

  console.log(`[Oracle]  Operator address: ${wallet.address}`);
  console.log(`[Oracle]  ReviewOracle:     ${ORACLE_ADDR}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(
    `[Oracle]  Balance:          ${ethers.formatEther(balance)} POL\n`
  );

  if (balance === 0n) {
    console.warn(
      "[WARN] Operator has zero balance — transactions will fail!"
    );
  }

  // Subscribe to PlagiarismCheckRequested events
  console.log("[Listen]  Subscribing to PlagiarismCheckRequested events...\n");

  contract.on("PlagiarismCheckRequested", (requestId, msId, cid) => {
    handleRequest(contract, requestId, msId, cid).catch(console.error);
  });

  // Keep process alive
  console.log("[Ready]   Oracle operator is running. Press Ctrl+C to stop.\n");

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[Oracle] Shutting down...");
    contract.removeAllListeners();
    if (provider.destroy) provider.destroy();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n[Oracle] Shutting down...");
    contract.removeAllListeners();
    if (provider.destroy) provider.destroy();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("[Fatal]", error);
  process.exit(1);
});
