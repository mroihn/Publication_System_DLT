/**
 * Plagiarism Checker Module
 *
 * Pluggable plagiarism detection. If PLAGIARISM_API_URL is set, it calls the
 * external API. Otherwise, it falls back to a deterministic mock that hashes
 * the CID to produce a repeatable score (useful for testing).
 */

/**
 * Check plagiarism for a given IPFS CID.
 * @param {string} cid  — The IPFS CID of the manuscript.
 * @returns {Promise<number>} — A similarity score from 0 to 100.
 */
async function checkPlagiarism(cid) {
  const apiUrl = process.env.PLAGIARISM_API_URL;

  if (apiUrl) {
    return await checkWithApi(apiUrl, cid);
  }

  return mockCheck(cid);
}

/**
 * Call an external plagiarism detection API.
 * Expects the API to accept POST { cid } and return { score: number }.
 */
async function checkWithApi(apiUrl, cid) {
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cid }),
    });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();

    if (typeof data.score !== "number" || data.score < 0 || data.score > 100) {
      throw new Error(`Invalid score from API: ${data.score}`);
    }

    return Math.round(data.score);
  } catch (error) {
    console.error(`[Plagiarism] API call failed: ${error.message}`);
    console.error("[Plagiarism] Falling back to mock checker");
    return mockCheck(cid);
  }
}

/**
 * Deterministic mock plagiarism check.
 * Hashes the CID to produce a repeatable score between 0 and 100.
 * This ensures the same CID always produces the same score for testing.
 */
function mockCheck(cid) {
  let hash = 0;
  for (let i = 0; i < cid.length; i++) {
    const char = cid.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0; // Simple string hash
  }
  const score = Math.abs(hash) % 101; // 0-100
  console.log(`[Plagiarism] Mock check for CID "${cid}" → score: ${score}`);
  return score;
}

module.exports = { checkPlagiarism };
