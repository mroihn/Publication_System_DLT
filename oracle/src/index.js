/**
 * Off-chain Oracle Operator
 *
 * Listens for two types of events emitted by the ReviewOracle contract:
 *
 *   1. `PlagiarismCheckRequested`  — runs plagiarism check and calls
 *      `fulfillPlagiarismCheck(requestId, score)` on-chain.
 *
 *   2. `ReviewerSelectionRequested` — selects an odd number of reviewers from
 *      the competency-tiered registry below, then calls
 *      `fulfillReviewerSelection(requestId, reviewers[])` on-chain.
 *
 * Reviewer Registry (hardcoded, off-chain):
 *   Each reviewer has a competency tier — HIGH, MEDIUM, or LOW — which
 *   represents their domain expertise level. Selection guarantees:
 *     • At least one HIGH-tier reviewer is always included.
 *     • Count is always odd (default 3) so majority voting is unambiguous.
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

// ──────────────────────── Reviewer Registry ───────────────────────────────────

/**
 * Competency tiers for reviewers.
 * HIGH   — domain experts, senior researchers / professors
 * MEDIUM — mid-career researchers with publication track record
 * LOW    — junior researchers / PhD candidates
 *
 * In production these would be loaded from a secure database or IPFS-pinned
 * JSON file. Hardcoded here for the academic DLT prototype.
 */
const COMPETENCY = Object.freeze({ HIGH: "high", MEDIUM: "medium", LOW: "low" });

/**
 * @typedef {Object} Reviewer
 * @property {string} address     — Ethereum address (must match on-chain REVIEWER_ROLE holders)
 * @property {string} name        — Human-readable identifier (logging only)
 * @property {string} competency  — COMPETENCY.HIGH | MEDIUM | LOW
 * @property {string[]} domains   — Subject-matter domains (for future routing)
 */

/** @type {Reviewer[]} */
const REVIEWER_REGISTRY = [
  // ── HIGH tier ──────────────────────────────────────────────────────────────
  {
    address: process.env.REVIEWER_HIGH_1 || "0x0000000000000000000000000000000000000001",
    name: "Prof. Alice Chen",
    competency: COMPETENCY.HIGH,
    domains: ["distributed-systems", "blockchain"],
  },
  {
    address: process.env.REVIEWER_HIGH_2 || "0x0000000000000000000000000000000000000002",
    name: "Prof. Bob Nakamura",
    competency: COMPETENCY.HIGH,
    domains: ["cryptography", "security"],
  },
  {
    address: process.env.REVIEWER_HIGH_3 || "0x0000000000000000000000000000000000000003",
    name: "Prof. Carol Santos",
    competency: COMPETENCY.HIGH,
    domains: ["machine-learning", "data-science"],
  },

  // ── MEDIUM tier ────────────────────────────────────────────────────────────
  {
    address: process.env.REVIEWER_MEDIUM_1 || "0x0000000000000000000000000000000000000004",
    name: "Dr. David Kim",
    competency: COMPETENCY.MEDIUM,
    domains: ["blockchain", "smart-contracts"],
  },
  {
    address: process.env.REVIEWER_MEDIUM_2 || "0x0000000000000000000000000000000000000005",
    name: "Dr. Elena Petrov",
    competency: COMPETENCY.MEDIUM,
    domains: ["networking", "protocols"],
  },
  {
    address: process.env.REVIEWER_MEDIUM_3 || "0x0000000000000000000000000000000000000006",
    name: "Dr. Fatima Al-Hassan",
    competency: COMPETENCY.MEDIUM,
    domains: ["distributed-systems", "consensus"],
  },
  {
    address: process.env.REVIEWER_MEDIUM_4 || "0x0000000000000000000000000000000000000007",
    name: "Dr. George Müller",
    competency: COMPETENCY.MEDIUM,
    domains: ["formal-verification", "type-systems"],
  },

  // ── LOW tier ───────────────────────────────────────────────────────────────
  {
    address: process.env.REVIEWER_LOW_1 || "0x0000000000000000000000000000000000000008",
    name: "Hiroshi Tanaka (PhD cand.)",
    competency: COMPETENCY.LOW,
    domains: ["blockchain", "tokenomics"],
  },
  {
    address: process.env.REVIEWER_LOW_2 || "0x0000000000000000000000000000000000000009",
    name: "Irina Volkov (PhD cand.)",
    competency: COMPETENCY.LOW,
    domains: ["machine-learning", "privacy"],
  },
  {
    address: process.env.REVIEWER_LOW_3 || "0x000000000000000000000000000000000000000a",
    name: "João Ferreira (PhD cand.)",
    competency: COMPETENCY.LOW,
    domains: ["networking", "iot"],
  },
];

/**
 * Number of reviewers to select per manuscript.
 * MUST be an odd number ≥ 3 so that majority voting is always unambiguous.
 * Override via NUM_REVIEWERS env var (must still be odd and ≥ 3).
 */
const NUM_REVIEWERS = (() => {
  const n = parseInt(process.env.NUM_REVIEWERS || "3", 10);
  if (n < 3 || n % 2 === 0) {
    console.warn(`[Config]  NUM_REVIEWERS="${n}" is invalid (must be odd ≥ 3). Defaulting to 3.`);
    return 3;
  }
  return n;
})();

// ──────────────────────── Reviewer Selection Logic ────────────────────────────

/**
 * Cryptographically shuffle an array using a seed derived from the request
 * parameters.  This is the off-chain equivalent of Fisher-Yates; because we
 * control the off-chain process the seed does not need to be provably random —
 * it just needs to be unpredictable enough that no single party can game it.
 *
 * @param {Reviewer[]} arr   The array to shuffle (mutated in-place).
 * @param {bigint}     seed  A BigInt seed.
 * @returns {Reviewer[]}
 */
function seededShuffle(arr, seed) {
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    // Mix the seed with the index to get the next pseudo-random number
    s = BigInt(
      "0x" +
        ethers
          .keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [s, BigInt(i)]))
          .slice(2)
    );
    const j = Number(s % BigInt(i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Select an odd number (NUM_REVIEWERS) of reviewers from the registry.
 *
 * Selection strategy:
 *   1. Always include at least one HIGH-tier reviewer (mandatory).
 *   2. Fill remaining slots from MEDIUM tier (preferred) then LOW tier.
 *   3. Shuffle each tier independently before picking to avoid bias.
 *   4. Final count is always NUM_REVIEWERS (odd, ≥ 3).
 *
 * @param {bigint} requestId   — The reviewer selection request ID (used as seed).
 * @param {bigint} msId        — The manuscript ID (used as seed).
 * @returns {{ reviewers: Reviewer[], summary: string }}
 */
function selectReviewers(requestId, msId) {
  // Derive a deterministic-but-unpredictable seed
  const seed = BigInt(
    "0x" +
      ethers
        .keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "uint256", "uint256"],
            [requestId, msId, BigInt(Date.now())]
          )
        )
        .slice(2)
  );

  // Partition registry into tiers
  const high   = seededShuffle([...REVIEWER_REGISTRY.filter(r => r.competency === COMPETENCY.HIGH)],   seed);
  const medium = seededShuffle([...REVIEWER_REGISTRY.filter(r => r.competency === COMPETENCY.MEDIUM)], seed ^ BigInt(1));
  const low    = seededShuffle([...REVIEWER_REGISTRY.filter(r => r.competency === COMPETENCY.LOW)],    seed ^ BigInt(2));

  const selected = [];

  // Rule 1: always pick at least one HIGH reviewer
  if (high.length === 0) {
    throw new Error("Reviewer registry has no HIGH-tier reviewers — cannot proceed.");
  }
  selected.push(high.shift());

  // Fill remaining slots preferring MEDIUM over LOW
  const remaining = NUM_REVIEWERS - selected.length;
  const pool = [...medium, ...low];
  for (let i = 0; i < remaining && i < pool.length; i++) {
    selected.push(pool[i]);
  }

  if (selected.length < NUM_REVIEWERS) {
    throw new Error(
      `Insufficient reviewers in registry. Need ${NUM_REVIEWERS}, only have ${selected.length}.`
    );
  }

  const summary = selected
    .map(r => `  • ${r.name} (${r.competency}) — ${r.address}`)
    .join("\n");

  return { reviewers: selected, summary };
}

// ─────────────────────────── Configuration ────────────────────────────────────

const REQUIRED_ENV = ["ORACLE_PRIVATE_KEY", "REVIEW_ORACLE_ADDRESS"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`ERROR: Missing required environment variable: ${key}`);
    console.error("Copy .env.example → .env and fill in the values.");
    process.exit(1);
  }
}

const RPC_WSS    = process.env.SEPOLIA_RPC_WSS;
const RPC_HTTP   = process.env.SEPOLIA_RPC_URL || "https://rpc.ankr.com/eth_sepolia";
const ORACLE_KEY  = process.env.ORACLE_PRIVATE_KEY;
const ORACLE_ADDR = process.env.REVIEW_ORACLE_ADDRESS;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);

// ──────────────────────────── Provider Setup ──────────────────────────────────

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

/** Set of plagiarism request IDs currently being processed. */
const inflightPlagiarism = new Set();

/** Set of reviewer selection request IDs currently being processed. */
const inflightReviewer = new Set();

// ──────────────────── Plagiarism Event Handler ────────────────────────────────

/**
 * Handle a PlagiarismCheckRequested event.
 */
async function handlePlagiarismRequest(contract, requestId, msId, cid) {
  const reqKey = requestId.toString();
  if (inflightPlagiarism.has(reqKey)) {
    console.log(`[Plagiarism][Skip] Request ${reqKey} already in-flight`);
    return;
  }

  try {
    const fulfilled = await contract.plagiarismRequestFulfilled(requestId);
    if (fulfilled) {
      console.log(`[Plagiarism][Skip] Request ${reqKey} already fulfilled on-chain`);
      return;
    }
  } catch { /* view call failed — proceed anyway */ }

  inflightPlagiarism.add(reqKey);
  console.log(`\n[Plagiarism] Request ID: ${reqKey} | Manuscript: ${msId} | CID: ${cid}`);

  try {
    const score = await checkPlagiarism(cid);
    console.log(`[Plagiarism] Score: ${score}/100`);

    console.log("[Plagiarism] Sending fulfillPlagiarismCheck...");
    const tx = await contract.fulfillPlagiarismCheck(requestId, score);
    console.log(`[Plagiarism] Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Plagiarism] Confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);
  } catch (error) {
    console.error(`[Plagiarism][Error] Failed to fulfill request ${reqKey}:`, error.message);
  } finally {
    inflightPlagiarism.delete(reqKey);
  }
}

// ──────────────────── Reviewer Selection Handler ─────────────────────────────

/**
 * Handle a ReviewerSelectionRequested event.
 * Selects an odd number of reviewers from the tiered registry and fulfills
 * the request on-chain via `fulfillReviewerSelection`.
 */
async function handleReviewerSelection(contract, requestId, msId) {
  const reqKey = requestId.toString();
  if (inflightReviewer.has(reqKey)) {
    console.log(`[Reviewer][Skip] Request ${reqKey} already in-flight`);
    return;
  }

  try {
    const fulfilled = await contract.reviewerRequestFulfilled(requestId);
    if (fulfilled) {
      console.log(`[Reviewer][Skip] Request ${reqKey} already fulfilled on-chain`);
      return;
    }
  } catch { /* view call failed — proceed anyway */ }

  inflightReviewer.add(reqKey);
  console.log(`\n[Reviewer] Request ID: ${reqKey} | Manuscript: ${msId}`);

  try {
    // Select reviewers off-chain using competency-tiered registry
    const { reviewers, summary } = selectReviewers(requestId, msId);

    console.log(`[Reviewer] Selected ${reviewers.length} reviewer(s) (count must be odd ≥ 3):`);
    console.log(summary);

    const addresses = reviewers.map(r => r.address);

    console.log("[Reviewer] Sending fulfillReviewerSelection...");
    const tx = await contract.fulfillReviewerSelection(requestId, addresses);
    console.log(`[Reviewer] Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Reviewer] Confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);
  } catch (error) {
    console.error(`[Reviewer][Error] Failed to fulfill request ${reqKey}:`, error.message);
  } finally {
    inflightReviewer.delete(reqKey);
  }
}

// ──────────────────────────── Main Loop ───────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Publication System — Off-chain Oracle Operator");
  console.log("═══════════════════════════════════════════════════════\n");

  const provider = createProvider();
  const wallet   = new ethers.Wallet(ORACLE_KEY, provider);
  const contract = new ethers.Contract(ORACLE_ADDR, ORACLE_ABI, wallet);

  console.log(`[Oracle]   Operator address : ${wallet.address}`);
  console.log(`[Oracle]   ReviewOracle     : ${ORACLE_ADDR}`);
  console.log(`[Oracle]   NUM_REVIEWERS    : ${NUM_REVIEWERS} (must be odd ≥ 3)\n`);

  // Print reviewer registry summary
  console.log("[Registry] Hardcoded reviewer registry:");
  const byTier = { [COMPETENCY.HIGH]: [], [COMPETENCY.MEDIUM]: [], [COMPETENCY.LOW]: [] };
  for (const r of REVIEWER_REGISTRY) byTier[r.competency].push(r);
  for (const [tier, list] of Object.entries(byTier)) {
    console.log(`  ${tier.toUpperCase().padEnd(6)} (${list.length}): ${list.map(r => r.name).join(", ")}`);
  }
  console.log();

  const balance = await provider.getBalance(wallet.address);
  console.log(`[Oracle]   Balance          : ${ethers.formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    console.warn("[WARN] Operator has zero balance — transactions will fail!");
  }

  // ── Subscribe to events ──────────────────────────────────────────────────

  console.log("[Listen]  Subscribing to PlagiarismCheckRequested events...");
  contract.on("PlagiarismCheckRequested", (requestId, msId, cid) => {
    handlePlagiarismRequest(contract, requestId, msId, cid).catch(console.error);
  });

  console.log("[Listen]  Subscribing to ReviewerSelectionRequested events...\n");
  contract.on("ReviewerSelectionRequested", (requestId, msId) => {
    handleReviewerSelection(contract, requestId, msId).catch(console.error);
  });

  console.log("[Ready]   Oracle operator is running. Press Ctrl+C to stop.\n");

  // Graceful shutdown
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
