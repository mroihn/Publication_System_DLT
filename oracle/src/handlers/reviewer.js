const { BACKEND_URL, ORACLE_SECRET } = require("../config");

const inflight = new Set();

// Ask the backend to select verified reviewers matching the manuscript's field and
// mint a burner ReviewerSessionWallet for each (double-blind: the reviewer's real
// address never touches the chain). Returns the burner addresses to assign.
async function mintReviewerSessions(msId, field) {
  const res = await fetch(`${BACKEND_URL}/api/v1/internal/reviewer-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Oracle-Secret": ORACLE_SECRET },
    body: JSON.stringify({ msId: Number(msId), field }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`backend reviewer-sessions failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return (data.sessions || []).map((s) => s.sessionAddress);
}

async function handleReviewerSelection(contract, requestId, msId, field) {
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
  console.log(`\n[Reviewer] Request ID: ${reqKey} | Manuscript: ${msId} | Field: ${field || "(none)"}`);

  try {
    if (!field) {
      throw new Error(`no field assigned to manuscript ${msId} — editor must approve first`);
    }

    // Backend selects field-matched verified reviewers and returns burner wallets.
    console.log("[Reviewer] Requesting field-matched burner session wallets from backend...");
    const addresses = await mintReviewerSessions(msId, field);
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
