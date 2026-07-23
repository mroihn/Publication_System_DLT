const { ethers, upgrades } = require("hardhat");

const CID = "QmTestCID123456789abcdef";
const METADATA = '{"title":"Test Paper","authors":["Alice"]}';
const REVIEW_CID = "QmTestReviewCID";
const REVIEW_COMMENTS = "Thorough methodology. Recommend acceptance with minor edits.";
const FIELD = "ai";
const EDITOR_CID = "QmEditorReviewCID";
const PUBLICATION_FEE = ethers.parseEther("100");
const REVIEWER_INCENTIVE = ethers.parseEther("10");
const INITIAL_JRT_SUPPLY = 1_000_000;

const Status = {
  SUBMITTED: 0,
  CHECKING: 1,
  UNDER_REVIEW: 2,
  REVISION_REQUESTED: 3,
  ACCEPTED: 4,
  REJECTED: 5,
  PUBLISHED: 6,
  PENDING_EDITOR: 7,
};

const Verdict = { ACCEPT: 0, REJECT: 1, REVISE: 2 };

const role = (name) => ethers.keccak256(ethers.toUtf8Bytes(name));

const ROLES = {
  ADMIN: role("ADMIN_ROLE"),
  RESEARCHER: role("RESEARCHER_ROLE"),
  REVIEWER: role("REVIEWER_ROLE"),
  ORACLE: role("ORACLE_ROLE"),
  MINTER: role("MINTER_ROLE"),
  OPERATOR: role("OPERATOR_ROLE"),
  REGISTRY: role("REGISTRY_ROLE"),
};

const SUBMIT_MS_TYPES = {
  SubmitManuscript: [
    { name: "cid", type: "string" },
    { name: "metadata", type: "string" },
    { name: "nonce", type: "uint256" },
  ],
};

const SUBMIT_REVIEW_TYPES = {
  SubmitReview: [
    { name: "msId", type: "uint256" },
    { name: "comments", type: "string" },
    { name: "verdict", type: "uint8" },
    { name: "nonce", type: "uint256" },
  ],
};

const REVISE_TYPES = {
  ReviseManuscript: [
    { name: "msId", type: "uint256" },
    { name: "newCid", type: "string" },
    { name: "nonce", type: "uint256" },
  ],
};

async function buildDomain(registry) {
  return {
    name: "PublicationRegistry",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await registry.getAddress(),
  };
}

function makeSigners(registry, domain) {
  const split = (raw) => {
    const { v, r, s } = ethers.Signature.from(raw);
    return { v, r, s };
  };
  return {
    async manuscript(signer, cid, metadata) {
      const nonce = await registry.nonces(signer.address);
      const raw = await signer.signTypedData(domain, SUBMIT_MS_TYPES, { cid, metadata, nonce });
      return { nonce, ...split(raw) };
    },
    async review(signer, msId, comments, verdict) {
      const nonce = await registry.nonces(signer.address);
      const raw = await signer.signTypedData(domain, SUBMIT_REVIEW_TYPES, {
        msId: BigInt(msId), comments, verdict, nonce,
      });
      return { nonce, ...split(raw) };
    },
    async revise(signer, msId, newCid) {
      const nonce = await registry.nonces(signer.address);
      const raw = await signer.signTypedData(domain, REVISE_TYPES, {
        msId: BigInt(msId), newCid, nonce,
      });
      return { nonce, ...split(raw) };
    },
  };
}

async function deployTokens() {
  const JournalToken = await ethers.getContractFactory("JournalToken");
  const journalToken = await JournalToken.deploy(INITIAL_JRT_SUPPLY);
  await journalToken.waitForDeployment();

  const DOIToken = await ethers.getContractFactory("DOIToken");
  const doiToken = await DOIToken.deploy();
  await doiToken.waitForDeployment();

  return { journalToken, doiToken };
}

async function deployRegistry(doiToken, journalToken, oracleAddress, admin) {
  const PublicationRegistry = await ethers.getContractFactory("PublicationRegistry");
  const registry = await upgrades.deployProxy(
    PublicationRegistry,
    [await doiToken.getAddress(), await journalToken.getAddress(), oracleAddress, admin.address],
    { initializer: "initialize", kind: "uups" }
  );
  await registry.waitForDeployment();
  return registry;
}

async function deployMockRegistry({ doiToken, journalToken, admin, reviewers = [] }) {
  const MockOracle = await ethers.getContractFactory("MockReviewOracle");
  const mockOracle = await MockOracle.deploy();
  await mockOracle.waitForDeployment();

  const registry = await deployRegistry(doiToken, journalToken, await mockOracle.getAddress(), admin);

  await doiToken.grantRole(ROLES.MINTER, await registry.getAddress());
  await registry.grantRole(ROLES.OPERATOR, admin.address);
  await registry.grantRole(ROLES.ORACLE, admin.address);
  for (const reviewer of reviewers) {
    await registry.grantRole(ROLES.REVIEWER, reviewer.address);
  }

  return { registry, mockOracle };
}

async function deployFullSystem({ admin, oracleOperator, reviewers = [] }) {
  const { journalToken, doiToken } = await deployTokens();

  const ReviewOracle = await ethers.getContractFactory("ReviewOracle");
  const reviewOracle = await ReviewOracle.deploy();
  await reviewOracle.waitForDeployment();

  const registry = await deployRegistry(doiToken, journalToken, await reviewOracle.getAddress(), admin);

  await doiToken.grantRole(ROLES.MINTER, await registry.getAddress());
  await reviewOracle.setPublicationRegistry(await registry.getAddress());
  await reviewOracle.grantRole(ROLES.ORACLE, oracleOperator.address);
  await registry.grantRole(ROLES.OPERATOR, admin.address);
  for (const reviewer of reviewers) {
    await registry.grantRole(ROLES.REVIEWER, reviewer.address);
  }

  return { journalToken, doiToken, reviewOracle, registry };
}

function addressOf(reviewer) {
  return reviewer.address ?? reviewer;
}

function createFlow(registry, relayer, signers) {
  const flow = {
    async submit(author, cid = CID, metadata = METADATA) {
      const msId = Number(await registry.nextManuscriptId());
      const sig = await signers.manuscript(author, cid, metadata);
      const tx = await registry
        .connect(relayer)
        .submitManuscript(cid, metadata, sig.nonce, sig.v, sig.r, sig.s);
      return { tx, msId };
    },
    passPlagiarism(msId, score = 10) {
      return registry.connect(relayer).fulfillPlagiarism(msId, score);
    },
    editorApprove(msId, field = FIELD, editorCid = EDITOR_CID) {
      return registry.connect(relayer).submitEditorReview(msId, true, field, editorCid);
    },
    editorReject(msId, field = FIELD, editorCid = EDITOR_CID) {
      return registry.connect(relayer).submitEditorReview(msId, false, field, editorCid);
    },
    assignReviewers(msId, reviewers) {
      return registry.connect(relayer).fulfillRandomReviewers(msId, reviewers.map(addressOf));
    },
    async review(signer, msId, verdict, comments = REVIEW_COMMENTS, reviewCid = REVIEW_CID) {
      const sig = await signers.review(signer, msId, comments, verdict);
      return registry
        .connect(relayer)
        .submitReview(msId, reviewCid, verdict, comments, sig.nonce, sig.v, sig.r, sig.s);
    },
    async revise(author, msId, newCid) {
      const sig = await signers.revise(author, msId, newCid);
      return registry
        .connect(relayer)
        .reviseManuscript(msId, newCid, sig.nonce, sig.v, sig.r, sig.s);
    },
    async toUnderReview({ author, reviewers, score = 10, field = FIELD, cid = CID, metadata = METADATA }) {
      const { msId } = await flow.submit(author, cid, metadata);
      await flow.passPlagiarism(msId, score);
      await flow.editorApprove(msId, field);
      await flow.assignReviewers(msId, reviewers);
      return msId;
    },
    async castVerdicts(msId, votes) {
      let tx;
      for (const [signer, verdict] of votes) {
        tx = await flow.review(signer, msId, verdict);
      }
      return tx;
    },
  };
  return flow;
}

module.exports = {
  CID,
  METADATA,
  REVIEW_CID,
  REVIEW_COMMENTS,
  FIELD,
  EDITOR_CID,
  PUBLICATION_FEE,
  REVIEWER_INCENTIVE,
  INITIAL_JRT_SUPPLY,
  Status,
  Verdict,
  ROLES,
  SUBMIT_MS_TYPES,
  SUBMIT_REVIEW_TYPES,
  REVISE_TYPES,
  buildDomain,
  makeSigners,
  deployTokens,
  deployRegistry,
  deployMockRegistry,
  deployFullSystem,
  createFlow,
};
