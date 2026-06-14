const { checkPlagiarism } = require("../plagiarism");

const inflight = new Set();

async function handlePlagiarismRequest(contract, requestId, msId, cid) {
  const reqKey = requestId.toString();
  if (inflight.has(reqKey)) {
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

  inflight.add(reqKey);
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
    inflight.delete(reqKey);
  }
}

module.exports = { handlePlagiarismRequest };
