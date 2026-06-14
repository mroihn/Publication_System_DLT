const { selectReviewers } = require("../reviewer");

const inflight = new Set();

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

    const addresses = reviewers.map(r => r.address);

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
