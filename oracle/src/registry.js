const COMPETENCY = Object.freeze({ HIGH: "high", MEDIUM: "medium", LOW: "low" });

/** @type {Array<{address: string, name: string, competency: string, domains: string[]}>} */
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

const NUM_REVIEWERS = (() => {
  const n = parseInt(process.env.NUM_REVIEWERS || "3", 10);
  if (n < 3 || n % 2 === 0) {
    console.warn(`[Config]  NUM_REVIEWERS="${n}" is invalid (must be odd ≥ 3). Defaulting to 3.`);
    return 3;
  }
  return n;
})();

module.exports = { COMPETENCY, REVIEWER_REGISTRY, NUM_REVIEWERS };
