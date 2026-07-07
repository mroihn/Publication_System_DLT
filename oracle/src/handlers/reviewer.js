const { selectReviewers } = require("../reviewer");
const { BACKEND_URL, ORACLE_SECRET } = require("../config");

const inflight = new Set();

// Ask the backend to mint a burner ReviewerSessionWallet for each selected
// reviewer (double-blind: the reviewer's real address never touches the chain).
// Returns the burner addresses in the same order the reviewers were selected.
async function mintReviewerSessions(msId, reviewers) {
  const res = await fetch(`${BACKEND_URL}/api/v1/internal/reviewer-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Oracle-Secret": ORACLE_SECRET },
    body: JSON.stringify({
      msId: Number(msId),
      reviewers: reviewers.map((r) => ({ mainAddress: r.address, tier: r.competency })),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`backend reviewer-sessions failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  // Preserve selection order by matching each reviewer's main address.
  return reviewers.map((r) => {
    const match = data.sessions.find(
      (s) => s.mainAddress.toLowerCase() === r.address.toLowerCase()
    );
    if (!match) throw new Error(`no session wallet returned for reviewer ${r.address}`);
    return match.sessionAddress;
  });
}

async function handleReviewerSelection(contract, requestId, msId) {
  const reqKey = requestId.toString();
  if (inflight.has(reqKey)) {
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

  inflight.add(reqKey);
  console.log(`\n[Reviewer] Request ID: ${reqKey} | Manuscript: ${msId}`);

  try {
    const { reviewers, summary } = selectReviewers(requestId, msId);

    console.log(`[Reviewer] Selected ${reviewers.length} reviewer(s) (count must be odd ≥ 3):`);
    console.log(summary);

    // Double-blind: swap real reviewer addresses for backend-minted burner wallets.
    console.log("[Reviewer] Requesting burner session wallets from backend...");
    const addresses = await mintReviewerSessions(msId, reviewers);
    console.log(`[Reviewer] Burner session addresses: ${addresses.join(", ")}`);

    console.log("[Reviewer] Sending fulfillReviewerSelection...");
    const tx = await contract.fulfillReviewerSelection(requestId, addresses);
    console.log(`[Reviewer] Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Reviewer] Confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);
  } catch (error) {
    console.error(`[Reviewer][Error] Failed to fulfill request ${reqKey}:`, error.message);
  } finally {
    inflight.delete(reqKey);
  }
}

module.exports = { handleReviewerSelection };
