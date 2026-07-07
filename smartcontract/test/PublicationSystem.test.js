const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Integration tests for the Decentralized Publication System.
 *
 * Tests use a MockReviewOracle that implements the IReviewOracle interface
 * as no-ops, allowing the test harness to call fulfillment functions
 * directly on PublicationRegistry to simulate the oracle callback flow.
 *
 * EIP-712 meta-tx pattern: the relayer (admin) calls the contract; the actual
 * author/reviewer signs typed data off-chain. In tests, admin holds OPERATOR_ROLE.
 */
describe("Publication System", function () {
  // Contracts
  let journalToken, doiToken, reviewOracle, registry;

  // Signers
  let admin, researcher, reviewer1, reviewer2, reviewer3, outsider;

  // Role hashes
  let RESEARCHER_ROLE, REVIEWER_ROLE, ORACLE_ROLE, ADMIN_ROLE, MINTER_ROLE, OPERATOR_ROLE;

  // Commonly used constants
  const CID = "QmTestCID123456789abcdef";
  const METADATA = '{"title":"Test Paper","authors":["Alice"]}';
  const REVIEW_CID = "QmTestReviewCID";
  const REVIEW_COMMENTS = "Thorough methodology. Recommend acceptance with minor edits.";
  const PUBLICATION_FEE = ethers.parseEther("100");
  const REVIEWER_INCENTIVE = ethers.parseEther("10");

  // Status enum values
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

  // Editor screening constants (plagiarism pass now waits for editor approval)
  const FIELD = "ai";
  const EDITOR_CID = "QmEditorReviewCID";

  // Verdict enum values — must match Solidity: ACCEPT=0, REJECT=1, REVISE=2
  const Verdict = {
    ACCEPT: 0,
    REJECT: 1,
    REVISE: 2,
  };

  // EIP-712 type definitions
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

  beforeEach(async function () {
    [admin, researcher, reviewer1, reviewer2, reviewer3, outsider] =
      await ethers.getSigners();

    // Compute role hashes
    RESEARCHER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RESEARCHER_ROLE"));
    REVIEWER_ROLE   = ethers.keccak256(ethers.toUtf8Bytes("REVIEWER_ROLE"));
    ORACLE_ROLE     = ethers.keccak256(ethers.toUtf8Bytes("ORACLE_ROLE"));
    ADMIN_ROLE      = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
    MINTER_ROLE     = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    OPERATOR_ROLE   = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));

    // Deploy JournalToken with 1M initial supply
    const JournalToken = await ethers.getContractFactory("JournalToken");
    journalToken = await JournalToken.deploy(1_000_000);
    await journalToken.waitForDeployment();

    // Deploy DOIToken
    const DOIToken = await ethers.getContractFactory("DOIToken");
    doiToken = await DOIToken.deploy();
    await doiToken.waitForDeployment();

    // Deploy PublicationRegistry via UUPS proxy
    const PublicationRegistry = await ethers.getContractFactory(
      "PublicationRegistry"
    );

    registry = await upgrades.deployProxy(
      PublicationRegistry,
      [
        await doiToken.getAddress(),
        await journalToken.getAddress(),
        admin.address, // admin acts as the oracle for testing
        admin.address,
      ],
      {
        initializer: "initialize",
        kind: "uups",
      }
    );
    await registry.waitForDeployment();

    // Grant MINTER_ROLE on DOIToken to PublicationRegistry
    await doiToken.grantRole(MINTER_ROLE, await registry.getAddress());

    // Grant roles (RESEARCHER_ROLE kept for backward-compat role-assignment tests)
    await registry.grantRole(RESEARCHER_ROLE, researcher.address);
    await registry.grantRole(REVIEWER_ROLE, reviewer1.address);
    await registry.grantRole(REVIEWER_ROLE, reviewer2.address);
    await registry.grantRole(REVIEWER_ROLE, reviewer3.address);

    // Transfer JRT to researcher for publication fee
    await journalToken.transfer(researcher.address, ethers.parseEther("1000"));
  });

  // ─────────────────────────── Deployment Tests ──────────────────────────────

  describe("Deployment", function () {
    it("should deploy JournalToken with correct initial supply", async function () {
      const balance = await journalToken.balanceOf(admin.address);
      // 1M - 1000 transferred to researcher
      expect(balance).to.equal(ethers.parseEther("999000"));
    });

    it("should deploy DOIToken with MINTER_ROLE granted to registry", async function () {
      const hasRole = await doiToken.hasRole(
        MINTER_ROLE,
        await registry.getAddress()
      );
      expect(hasRole).to.be.true;
    });

    it("should deploy PublicationRegistry as UUPS proxy", async function () {
      const nextId = await registry.nextManuscriptId();
      expect(nextId).to.equal(0);
    });

    it("should have correct roles assigned", async function () {
      expect(await registry.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
      expect(await registry.hasRole(RESEARCHER_ROLE, researcher.address)).to.be.true;
      expect(await registry.hasRole(REVIEWER_ROLE, reviewer1.address)).to.be.true;
    });
  });

  // ─────────────────────── Manuscript Submission Tests ────────────────────────

  describe("Manuscript Submission", function () {
    it("should revert if caller lacks OPERATOR_ROLE", async function () {
      // outsider has no OPERATOR_ROLE — use dummy sig values, fails at access control
      await expect(
        registry.connect(outsider).submitManuscript(CID, METADATA, 0, 27, ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.reverted;
    });
  });

  // ──────────────────── Full Lifecycle: Happy Path ───────────────────────────

  describe("Full Lifecycle — Accept Path", function () {
    let msId;

    beforeEach(async function () {
      msId = 0;
    });

    it("should handle plagiarism check fulfillment — pass", async function () {
      // Placeholder — full tests below in State Machine describe
    });
  });

  // ────────────── State Machine Tests (Direct Callbacks) ────────────────────

  describe("State Machine — Direct Oracle Simulation", function () {
    let mockOracleRegistry;
    let domain;

    // Sign a submitManuscript request on behalf of signer
    async function signMs(signer, cid, metadata) {
      const nonce = await mockOracleRegistry.nonces(signer.address);
      const raw = await signer.signTypedData(domain, SUBMIT_MS_TYPES, { cid, metadata, nonce });
      const { v, r, s } = ethers.Signature.from(raw);
      return { nonce, v, r, s };
    }

    // Sign a submitReview request on behalf of signer
    async function signReview(signer, msId, comments, verdict) {
      const nonce = await mockOracleRegistry.nonces(signer.address);
      const raw = await signer.signTypedData(domain, SUBMIT_REVIEW_TYPES, {
        msId: BigInt(msId), comments, verdict, nonce,
      });
      const { v, r, s } = ethers.Signature.from(raw);
      return { nonce, v, r, s };
    }

    // Sign a reviseManuscript request on behalf of signer
    async function signRevise(signer, msId, newCid) {
      const nonce = await mockOracleRegistry.nonces(signer.address);
      const raw = await signer.signTypedData(domain, REVISE_TYPES, {
        msId: BigInt(msId), newCid, nonce,
      });
      const { v, r, s } = ethers.Signature.from(raw);
      return { nonce, v, r, s };
    }

    beforeEach(async function () {
      const MockOracle = await ethers.getContractFactory("MockReviewOracle");
      const mockOracle = await MockOracle.deploy();
      await mockOracle.waitForDeployment();

      const PublicationRegistry = await ethers.getContractFactory(
        "PublicationRegistry"
      );
      mockOracleRegistry = await upgrades.deployProxy(
        PublicationRegistry,
        [
          await doiToken.getAddress(),
          await journalToken.getAddress(),
          await mockOracle.getAddress(),
          admin.address,
        ],
        {
          initializer: "initialize",
          kind: "uups",
        }
      );
      await mockOracleRegistry.waitForDeployment();

      // Grant DOIToken MINTER_ROLE to the new registry
      await doiToken.grantRole(
        MINTER_ROLE,
        await mockOracleRegistry.getAddress()
      );

      // Grant roles
      await mockOracleRegistry.grantRole(OPERATOR_ROLE, admin.address);
      await mockOracleRegistry.grantRole(REVIEWER_ROLE, reviewer1.address);
      await mockOracleRegistry.grantRole(REVIEWER_ROLE, reviewer2.address);
      await mockOracleRegistry.grantRole(REVIEWER_ROLE, reviewer3.address);

      // Grant ORACLE_ROLE to admin for simulating oracle callbacks
      await mockOracleRegistry.grantRole(ORACLE_ROLE, admin.address);

      // Transfer JRT to researcher
      await journalToken.transfer(researcher.address, ethers.parseEther("500"));

      // Build EIP-712 domain (uses the deployed contract address and actual chainId)
      domain = {
        name: "PublicationRegistry",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await mockOracleRegistry.getAddress(),
      };
    });

    it("should submit manuscript and enter CHECKING state", async function () {
      const { nonce, v, r, s } = await signMs(researcher, CID, METADATA);

      const tx = await mockOracleRegistry
        .connect(admin)
        .submitManuscript(CID, METADATA, nonce, v, r, s);

      await expect(tx)
        .to.emit(mockOracleRegistry, "ManuscriptSubmitted")
        .withArgs(0, researcher.address, CID);

      const ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.status).to.equal(Status.CHECKING);
      expect(ms.author).to.equal(researcher.address);
      expect(ms.cid).to.equal(CID);
      expect(ms.version).to.equal(1);
    });

    it("should transition CHECKING → PENDING_EDITOR on plagiarism pass", async function () {
      const { nonce, v, r, s } = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, nonce, v, r, s);

      const tx = await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 15);

      await expect(tx)
        .to.emit(mockOracleRegistry, "DecisionMade")
        .withArgs(0, Status.PENDING_EDITOR);

      const ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.status).to.equal(Status.PENDING_EDITOR);
      expect(ms.plagiarismScore).to.equal(15);
    });

    it("should transition PENDING_EDITOR → UNDER_REVIEW on editor approval and assign the field", async function () {
      const { nonce, v, r, s } = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, nonce, v, r, s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 15);

      const tx = await mockOracleRegistry.connect(admin).submitEditorReview(0, true, FIELD, EDITOR_CID);
      await expect(tx)
        .to.emit(mockOracleRegistry, "EditorReviewed")
        .withArgs(0, true, FIELD, EDITOR_CID);
      await expect(tx)
        .to.emit(mockOracleRegistry, "DecisionMade")
        .withArgs(0, Status.UNDER_REVIEW);

      const ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.status).to.equal(Status.UNDER_REVIEW);
      expect(ms.field).to.equal(FIELD);
      expect(await mockOracleRegistry.getField(0)).to.equal(FIELD);
    });

    it("should desk-reject a manuscript when the editor rejects", async function () {
      const { nonce, v, r, s } = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, nonce, v, r, s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 15);

      const tx = await mockOracleRegistry.connect(admin).submitEditorReview(0, false, FIELD, EDITOR_CID);
      await expect(tx)
        .to.emit(mockOracleRegistry, "DecisionMade")
        .withArgs(0, Status.REJECTED);

      const ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.status).to.equal(Status.REJECTED);
    });

    it("should record editor-verified reviewer fields on-chain", async function () {
      const fields = ["ai", "blockchain"];
      const tx = await mockOracleRegistry.connect(admin).verifyReviewerFields(reviewer1.address, fields);
      await expect(tx)
        .to.emit(mockOracleRegistry, "ReviewerFieldsVerified")
        .withArgs(reviewer1.address, fields);

      expect(await mockOracleRegistry.getVerifiedFields(reviewer1.address)).to.deep.equal(fields);

      // Latest verification overwrites the previous set
      await mockOracleRegistry.connect(admin).verifyReviewerFields(reviewer1.address, ["data-science"]);
      expect(await mockOracleRegistry.getVerifiedFields(reviewer1.address)).to.deep.equal(["data-science"]);
    });

    it("should transition CHECKING → REJECTED on plagiarism fail", async function () {
      const { nonce, v, r, s } = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, nonce, v, r, s);

      const tx = await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 50);

      await expect(tx)
        .to.emit(mockOracleRegistry, "DecisionMade")
        .withArgs(0, Status.REJECTED);

      const ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.status).to.equal(Status.REJECTED);
    });

    it("should assign reviewers via fulfillRandomReviewers", async function () {
      const { nonce, v, r, s } = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, nonce, v, r, s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 10);
      await mockOracleRegistry.connect(admin).submitEditorReview(0, true, FIELD, EDITOR_CID);

      const reviewers = [reviewer1.address, reviewer2.address, reviewer3.address];
      const tx = await mockOracleRegistry.connect(admin).fulfillRandomReviewers(0, reviewers);

      await expect(tx)
        .to.emit(mockOracleRegistry, "ReviewersAssigned")
        .withArgs(0, reviewers);

      const ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.reviewers.length).to.equal(3);
    });

    it("should handle review submission and majority ACCEPT", async function () {
      const msData = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, msData.nonce, msData.v, msData.r, msData.s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 10);
      await mockOracleRegistry.connect(admin).submitEditorReview(0, true, FIELD, EDITOR_CID);
      await mockOracleRegistry.connect(admin).fulfillRandomReviewers(0, [
        reviewer1.address, reviewer2.address, reviewer3.address,
      ]);

      const r1 = await signReview(reviewer1, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r1.nonce, r1.v, r1.r, r1.s);

      const r2 = await signReview(reviewer2, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r2.nonce, r2.v, r2.r, r2.s);

      const r3 = await signReview(reviewer3, 0, REVIEW_COMMENTS, Verdict.REJECT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.REJECT, REVIEW_COMMENTS, r3.nonce, r3.v, r3.r, r3.s);

      const ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.status).to.equal(Status.ACCEPTED);
      expect(ms.acceptCount).to.equal(2);
      expect(ms.rejectCount).to.equal(1);
    });

    it("should handle majority REJECT", async function () {
      const msData = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, msData.nonce, msData.v, msData.r, msData.s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 10);
      await mockOracleRegistry.connect(admin).submitEditorReview(0, true, FIELD, EDITOR_CID);
      await mockOracleRegistry.connect(admin).fulfillRandomReviewers(0, [
        reviewer1.address, reviewer2.address, reviewer3.address,
      ]);

      const r1 = await signReview(reviewer1, 0, REVIEW_COMMENTS, Verdict.REJECT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.REJECT, REVIEW_COMMENTS, r1.nonce, r1.v, r1.r, r1.s);

      const r2 = await signReview(reviewer2, 0, REVIEW_COMMENTS, Verdict.REJECT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.REJECT, REVIEW_COMMENTS, r2.nonce, r2.v, r2.r, r2.s);

      const r3 = await signReview(reviewer3, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r3.nonce, r3.v, r3.r, r3.s);

      const ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.status).to.equal(Status.REJECTED);
    });

    it("should handle majority REVISE", async function () {
      const msData = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, msData.nonce, msData.v, msData.r, msData.s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 10);
      await mockOracleRegistry.connect(admin).submitEditorReview(0, true, FIELD, EDITOR_CID);
      await mockOracleRegistry.connect(admin).fulfillRandomReviewers(0, [
        reviewer1.address, reviewer2.address, reviewer3.address,
      ]);

      const r1 = await signReview(reviewer1, 0, REVIEW_COMMENTS, Verdict.REVISE);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.REVISE, REVIEW_COMMENTS, r1.nonce, r1.v, r1.r, r1.s);

      const r2 = await signReview(reviewer2, 0, REVIEW_COMMENTS, Verdict.REVISE);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.REVISE, REVIEW_COMMENTS, r2.nonce, r2.v, r2.r, r2.s);

      const r3 = await signReview(reviewer3, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r3.nonce, r3.v, r3.r, r3.s);

      const ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.status).to.equal(Status.REVISION_REQUESTED);
    });

    it("should prevent double review", async function () {
      const msData = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, msData.nonce, msData.v, msData.r, msData.s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 10);
      await mockOracleRegistry.connect(admin).submitEditorReview(0, true, FIELD, EDITOR_CID);
      await mockOracleRegistry.connect(admin).fulfillRandomReviewers(0, [
        reviewer1.address, reviewer2.address, reviewer3.address,
      ]);

      const r1 = await signReview(reviewer1, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r1.nonce, r1.v, r1.r, r1.s);

      // reviewer1 tries to review again — nonce incremented so sig is invalid
      const r1b = await signReview(reviewer1, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await expect(
        mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r1b.nonce, r1b.v, r1b.r, r1b.s)
      ).to.be.revertedWithCustomError(mockOracleRegistry, "AlreadyReviewed");
    });

    it("should prevent non-assigned reviewer from submitting", async function () {
      const msData = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, msData.nonce, msData.v, msData.r, msData.s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 10);
      await mockOracleRegistry.connect(admin).submitEditorReview(0, true, FIELD, EDITOR_CID);
      // Only assign reviewer1 and reviewer2
      await mockOracleRegistry.connect(admin).fulfillRandomReviewers(0, [
        reviewer1.address, reviewer2.address,
      ]);

      // reviewer3 is not assigned
      const r3 = await signReview(reviewer3, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await expect(
        mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r3.nonce, r3.v, r3.r, r3.s)
      ).to.be.revertedWithCustomError(mockOracleRegistry, "NotAssignedReviewer");
    });

    it("should handle revise → resubmit flow", async function () {
      const msData = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, msData.nonce, msData.v, msData.r, msData.s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 10);
      await mockOracleRegistry.connect(admin).submitEditorReview(0, true, FIELD, EDITOR_CID);
      await mockOracleRegistry.connect(admin).fulfillRandomReviewers(0, [
        reviewer1.address, reviewer2.address, reviewer3.address,
      ]);

      // All reviewers say REVISE
      const r1 = await signReview(reviewer1, 0, REVIEW_COMMENTS, Verdict.REVISE);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.REVISE, REVIEW_COMMENTS, r1.nonce, r1.v, r1.r, r1.s);
      const r2 = await signReview(reviewer2, 0, REVIEW_COMMENTS, Verdict.REVISE);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.REVISE, REVIEW_COMMENTS, r2.nonce, r2.v, r2.r, r2.s);
      const r3 = await signReview(reviewer3, 0, REVIEW_COMMENTS, Verdict.REVISE);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.REVISE, REVIEW_COMMENTS, r3.nonce, r3.v, r3.r, r3.s);

      let ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.status).to.equal(Status.REVISION_REQUESTED);

      // Researcher revises
      const newCID = "QmRevisedCID987654321";
      const revData = await signRevise(researcher, 0, newCID);
      await mockOracleRegistry.connect(admin).reviseManuscript(0, newCID, revData.nonce, revData.v, revData.r, revData.s);

      ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.status).to.equal(Status.CHECKING);
      expect(ms.cid).to.equal(newCID);
      expect(ms.version).to.equal(2);
      expect(ms.acceptCount).to.equal(0);
      expect(ms.rejectCount).to.equal(0);
      expect(ms.reviseCount).to.equal(0);
      expect(ms.reviewCount).to.equal(0);
    });

    it("should handle full publication flow with fee payment", async function () {
      const msData = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, msData.nonce, msData.v, msData.r, msData.s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 5);
      await mockOracleRegistry.connect(admin).submitEditorReview(0, true, FIELD, EDITOR_CID);
      await mockOracleRegistry.connect(admin).fulfillRandomReviewers(0, [
        reviewer1.address, reviewer2.address, reviewer3.address,
      ]);

      // All accept
      const r1 = await signReview(reviewer1, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r1.nonce, r1.v, r1.r, r1.s);
      const r2 = await signReview(reviewer2, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r2.nonce, r2.v, r2.r, r2.s);
      const r3 = await signReview(reviewer3, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r3.nonce, r3.v, r3.r, r3.s);

      const ms = await mockOracleRegistry.getManuscript(0);
      expect(ms.status).to.equal(Status.ACCEPTED);

      // researcher's wallet is ms.author (set via ecrecover) — direct call to payPublicationFee
      await journalToken
        .connect(researcher)
        .approve(await mockOracleRegistry.getAddress(), PUBLICATION_FEE);

      const tx = await mockOracleRegistry.connect(researcher).payPublicationFee(0);

      await expect(tx)
        .to.emit(mockOracleRegistry, "IncentivePaid")
        .withArgs(reviewer1.address, REVIEWER_INCENTIVE);
      await expect(tx)
        .to.emit(mockOracleRegistry, "DecisionMade")
        .withArgs(0, Status.PUBLISHED);

      const finalMs = await mockOracleRegistry.getManuscript(0);
      expect(finalMs.status).to.equal(Status.PUBLISHED);

      const r1Balance = await journalToken.balanceOf(reviewer1.address);
      expect(r1Balance).to.equal(REVIEWER_INCENTIVE);
    });

    it("should revert payPublicationFee without sufficient allowance", async function () {
      const msData = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, msData.nonce, msData.v, msData.r, msData.s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 5);
      await mockOracleRegistry.connect(admin).submitEditorReview(0, true, FIELD, EDITOR_CID);
      await mockOracleRegistry.connect(admin).fulfillRandomReviewers(0, [
        reviewer1.address, reviewer2.address, reviewer3.address,
      ]);

      const r1 = await signReview(reviewer1, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r1.nonce, r1.v, r1.r, r1.s);
      const r2 = await signReview(reviewer2, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r2.nonce, r2.v, r2.r, r2.s);
      const r3 = await signReview(reviewer3, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r3.nonce, r3.v, r3.r, r3.s);

      // Don't approve — should revert
      await expect(
        mockOracleRegistry.connect(researcher).payPublicationFee(0)
      ).to.be.revertedWithCustomError(
        mockOracleRegistry,
        "InsufficientAllowance"
      );
    });

    it("should revert if non-author tries to pay fee", async function () {
      const msData = await signMs(researcher, CID, METADATA);
      await mockOracleRegistry.connect(admin).submitManuscript(CID, METADATA, msData.nonce, msData.v, msData.r, msData.s);
      await mockOracleRegistry.connect(admin).fulfillPlagiarism(0, 5);
      await mockOracleRegistry.connect(admin).submitEditorReview(0, true, FIELD, EDITOR_CID);
      await mockOracleRegistry.connect(admin).fulfillRandomReviewers(0, [
        reviewer1.address, reviewer2.address, reviewer3.address,
      ]);

      const r1 = await signReview(reviewer1, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r1.nonce, r1.v, r1.r, r1.s);
      const r2 = await signReview(reviewer2, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r2.nonce, r2.v, r2.r, r2.s);
      const r3 = await signReview(reviewer3, 0, REVIEW_COMMENTS, Verdict.ACCEPT);
      await mockOracleRegistry.connect(admin).submitReview(0, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, r3.nonce, r3.v, r3.r, r3.s);

      // outsider is not the author — _requireAuthor will reject them
      await expect(
        mockOracleRegistry.connect(outsider).payPublicationFee(0)
      ).to.be.revertedWithCustomError(mockOracleRegistry, "NotAuthor");
    });
  });

  // ────────────────────── DOIToken Tests ─────────────────────────────────────

  describe("DOIToken", function () {
    it("should allow posting comments on existing DOI", async function () {
      await doiToken.grantRole(MINTER_ROLE, admin.address);
      await doiToken.mint(researcher.address, "ipfs://testURI");

      const commentHash = ethers.keccak256(
        ethers.toUtf8Bytes("Interesting paper!")
      );
      await expect(doiToken.connect(outsider).postComment(0, commentHash))
        .to.emit(doiToken, "CommentPosted")
        .withArgs(0, outsider.address, commentHash);
    });

    it("should revert comment on non-existent DOI", async function () {
      const commentHash = ethers.keccak256(
        ethers.toUtf8Bytes("Comment on nothing")
      );
      await expect(
        doiToken.connect(outsider).postComment(999, commentHash)
      ).to.be.reverted;
    });
  });

  // ────────────────────── JournalToken Tests ─────────────────────────────────

  describe("JournalToken", function () {
    it("should mint tokens only with MINTER_ROLE", async function () {
      await expect(
        journalToken
          .connect(outsider)
          .mint(outsider.address, ethers.parseEther("100"))
      ).to.be.reverted;
    });

    it("should allow admin to mint additional tokens", async function () {
      await journalToken.mint(outsider.address, ethers.parseEther("500"));
      expect(await journalToken.balanceOf(outsider.address)).to.equal(
        ethers.parseEther("500")
      );
    });

    it("should revert minting zero amount", async function () {
      await expect(
        journalToken.mint(outsider.address, 0)
      ).to.be.revertedWithCustomError(journalToken, "MintAmountZero");
    });
  });

  // ────────────────────── Access Control Tests ───────────────────────────────

  describe("Access Control", function () {
    it("should prevent unauthorized UUPS upgrade", async function () {
      const PublicationRegistry = await ethers.getContractFactory(
        "PublicationRegistry"
      );

      await expect(
        upgrades.upgradeProxy(await registry.getAddress(), PublicationRegistry.connect(outsider), {
          kind: "uups",
        })
      ).to.be.reverted;
    });
  });
});
