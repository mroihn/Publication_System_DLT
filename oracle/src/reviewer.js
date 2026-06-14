const { ethers } = require("ethers");
const { COMPETENCY, REVIEWER_REGISTRY, NUM_REVIEWERS } = require("./registry");

function seededShuffle(arr, seed) {
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
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

function selectReviewers(requestId, msId) {
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

  const high   = seededShuffle([...REVIEWER_REGISTRY.filter(r => r.competency === COMPETENCY.HIGH)],   seed);
  const medium = seededShuffle([...REVIEWER_REGISTRY.filter(r => r.competency === COMPETENCY.MEDIUM)], seed ^ BigInt(1));
  const low    = seededShuffle([...REVIEWER_REGISTRY.filter(r => r.competency === COMPETENCY.LOW)],    seed ^ BigInt(2));

  if (high.length === 0) {
    throw new Error("Reviewer registry has no HIGH-tier reviewers — cannot proceed.");
  }

  const selected = [high.shift()];
  const pool = [...medium, ...low];
  for (let i = 0; i < NUM_REVIEWERS - 1 && i < pool.length; i++) {
    selected.push(pool[i]);
  }

  if (selected.length < NUM_REVIEWERS) {
    throw new Error(`Insufficient reviewers in registry. Need ${NUM_REVIEWERS}, only have ${selected.length}.`);
  }

  const summary = selected
    .map(r => `  • ${r.name} (${r.competency}) — ${r.address}`)
    .join("\n");

  return { reviewers: selected, summary };
}

module.exports = { selectReviewers };
