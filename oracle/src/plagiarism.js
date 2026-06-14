async function checkPlagiarism(cid) {
  const apiUrl = process.env.PLAGIARISM_API_URL;

  if (apiUrl) {
    return await checkWithApi(apiUrl, cid);
  }

  return mockCheck(cid);
}

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
