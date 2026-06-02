const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Full Flow Integration Test
 *
 * Tests the complete publication lifecycle using ALL real contracts
 * (no mocks), following the updated architecture where reviewer selection
 * is performed off-chain by the oracle operator:
 *
 *   Researcher → submitManuscript
 *     → ReviewOracle emits PlagiarismCheckRequested
 *   Oracle Operator → fulfillPlagiarismCheck
 *     → ReviewOracle calls Registry.fulfillPlagiarism
 *     → Registry calls ReviewOracle.requestRandomReviewers
 *     → ReviewOracle emits ReviewerSelectionRequested
 *   Oracle Operator → fulfillReviewerSelection (off-chain selection)
 *     → ReviewOracle calls Registry.fulfillRandomReviewers
 *   Reviewers → submitReview (×N, N is odd ≥ 3)
 *   Researcher → approve JRT → payPublicationFee
 *     → DOI minted with standard DOI format → PUBLISHED
 */
describe("Full Flow — Submit to DOI", function () {
  // Contracts
  let journalToken, doiToken, reviewOracle, registry;

  // Signers
  let admin, oracleOperator, researcher;
  let reviewer1, reviewer2, reviewer3, reviewer4, reviewer5;

  // Role hashes
  const roles = {};

  // Constants
  const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
  const METADATA = '{"title":"Decentralized Consensus","authors":["Alice","Bob"]}';
  const PUBLICATION_FEE = ethers.parseEther("100");
  const REVIEWER_INCENTIVE = ethers.parseEther("10");

  // Status enum
  const Status = {
    SUBMITTED: 0,
    CHECKING: 1,
    UNDER_REVIEW: 2,
    REVISION_REQUESTED: 3,
    ACCEPTED: 4,
    REJECTED: 5,
    PUBLISHED: 6,
  };

  const Verdict = { ACCEPT: 0, REJECT: 1, REVISE: 2 };

  before(async function () {
    [admin, oracleOperator, researcher, reviewer1, reviewer2, reviewer3, reviewer4, reviewer5] =
      await ethers.getSigners();

    // Compute role hashes
    roles.RESEARCHER = ethers.keccak256(ethers.toUtf8Bytes("RESEARCHER_ROLE"));
    roles.REVIEWER   = ethers.keccak256(ethers.toUtf8Bytes("REVIEWER_ROLE"));
    roles.ORACLE     = ethers.keccak256(ethers.toUtf8Bytes("ORACLE_ROLE"));
    roles.ADMIN      = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
    roles.MINTER     = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    roles.REGISTRY   = ethers.keccak256(ethers.toUtf8Bytes("REGISTRY_ROLE"));

    // ─── Deploy all contracts ───

    const JournalToken = await ethers.getContractFactory("JournalToken");
    journalToken = await JournalToken.deploy(1_000_000);
    await journalToken.waitForDeployment();

    const DOIToken = await ethers.getContractFactory("DOIToken");
    doiToken = await DOIToken.deploy();
    await doiToken.waitForDeployment();

    const ReviewOracle = await ethers.getContractFactory("ReviewOracle");
    reviewOracle = await ReviewOracle.deploy();
    await reviewOracle.waitForDeployment();

    const PublicationRegistry = await ethers.getContractFactory("PublicationRegistry");
    registry = await upgrades.deployProxy(
      PublicationRegistry,
      [
        await doiToken.getAddress(),
        await journalToken.getAddress(),
        await reviewOracle.getAddress(),
        admin.address,
      ],
      { initializer: "initialize", kind: "uups" }
    );
    await registry.waitForDeployment();

    // ─── Post-deployment wiring ───

    // DOIToken: grant MINTER_ROLE to Registry
    await doiToken.grantRole(roles.MINTER, await registry.getAddress());

    // ReviewOracle: link to Registry (grants REGISTRY_ROLE to registry)
    await reviewOracle.setPublicationRegistry(await registry.getAddress());

    // ReviewOracle: grant ORACLE_ROLE to oracleOperator
    await reviewOracle.grantRole(roles.ORACLE, oracleOperator.address);

    // Registry: grant RESEARCHER_ROLE
    await registry.grantRole(roles.RESEARCHER, researcher.address);

    // Registry: grant REVIEWER_ROLE to all potential reviewers
    // (In production these match the addresses in the off-chain reviewer registry)
    await registry.grantRole(roles.REVIEWER, reviewer1.address);
    await registry.grantRole(roles.REVIEWER, reviewer2.address);
    await registry.grantRole(roles.REVIEWER, reviewer3.address);
    await registry.grantRole(roles.REVIEWER, reviewer4.address);
    await registry.grantRole(roles.REVIEWER, reviewer5.address);

    // Fund researcher with JRT for publication fee
    await journalToken.transfer(researcher.address, ethers.parseEther("500"));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 1: Happy path — Submit → Plagiarism pass → Review ACCEPT → DOI
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Scenario 1: Submit → Accept → Publish (Happy Path)", function () {
    let msId;
    let assignedReviewers;

    it("Step 1: Researcher submits manuscript → CHECKING + PlagiarismCheckRequested emitted", async function () {
      const tx = await registry.connect(researcher).submitManuscript(CID, METADATA);

      // ManuscriptSubmitted from Registry
      await expect(tx).to.emit(registry, "ManuscriptSubmitted").withArgs(0, CID);

      // PlagiarismCheckRequested from ReviewOracle (requestId=0, msId=0)
      await expect(tx).to.emit(reviewOracle, "PlagiarismCheckRequested");

      msId = 0;
      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.CHECKING);
      expect(ms.author).to.equal(researcher.address);
      expect(ms.cid).to.equal(CID);
      expect(ms.version).to.equal(1);
    });

    it("Step 2a: Oracle operator fulfills plagiarism check (score=15, pass) → UNDER_REVIEW + ReviewerSelectionRequested", async function () {
      // plagiarism requestId = 0
      const tx = await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(0, 15);

      // PlagiarismCheckFulfilled from ReviewOracle
      await expect(tx).to.emit(reviewOracle, "PlagiarismCheckFulfilled").withArgs(0, 0, 15);

      // DecisionMade(UNDER_REVIEW) from Registry
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.UNDER_REVIEW);

      // ReviewerSelectionRequested from ReviewOracle (reviewer requestId=0, msId=0)
      await expect(tx).to.emit(reviewOracle, "ReviewerSelectionRequested");

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.UNDER_REVIEW);
      expect(ms.plagiarismScore).to.equal(15);
      // Reviewers not yet assigned (oracle must fulfill separately)
      expect(ms.reviewers.length).to.equal(0);
    });

    it("Step 2b: Oracle operator fulfills reviewer selection (off-chain, 3 reviewers) → ReviewersAssigned", async function () {
      // The off-chain oracle selects 3 reviewers from its tiered registry.
      // In tests we simulate this by picking 3 known accounts with REVIEWER_ROLE.
      const selectedReviewers = [reviewer1.address, reviewer2.address, reviewer3.address];

      // reviewer selection requestId = 0
      const tx = await reviewOracle
        .connect(oracleOperator)
        .fulfillReviewerSelection(0, selectedReviewers);

      await expect(tx)
        .to.emit(reviewOracle, "ReviewerSelectionFulfilled")
        .withArgs(0, msId, selectedReviewers);

      await expect(tx).to.emit(registry, "ReviewersAssigned").withArgs(msId, selectedReviewers);

      const ms = await registry.getManuscript(msId);
      expect(ms.reviewers.length).to.equal(3);
      assignedReviewers = ms.reviewers;
      console.log("    Assigned reviewers:", assignedReviewers);
    });

    it("Step 3: All 3 reviewers submit ACCEPT verdicts → ACCEPTED", async function () {
      const reviewHash = ethers.keccak256(ethers.toUtf8Bytes("Excellent research!"));

      const allSigners = [reviewer1, reviewer2, reviewer3, reviewer4, reviewer5];
      const signerMap = {};
      for (const r of allSigners) signerMap[r.address] = r;

      const signer0 = signerMap[assignedReviewers[0]];
      const signer1 = signerMap[assignedReviewers[1]];
      const signer2 = signerMap[assignedReviewers[2]];

      await expect(
        registry.connect(signer0).submitReview(msId, reviewHash, Verdict.ACCEPT)
      ).to.emit(registry, "ReviewSubmitted").withArgs(msId, signer0.address, Verdict.ACCEPT);

      await expect(
        registry.connect(signer1).submitReview(msId, reviewHash, Verdict.ACCEPT)
      ).to.emit(registry, "ReviewSubmitted").withArgs(msId, signer1.address, Verdict.ACCEPT);

      // Third reviewer triggers decision
      const tx = await registry.connect(signer2).submitReview(msId, reviewHash, Verdict.ACCEPT);
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.ACCEPTED);

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.ACCEPTED);
      expect(ms.acceptCount).to.equal(3);
      expect(ms.reviewCount).to.equal(3);
    });

    it("Step 4: Researcher approves JRT and pays publication fee → DOI minted (standard format) → PUBLISHED", async function () {
      await journalToken.connect(researcher).approve(await registry.getAddress(), PUBLICATION_FEE);

      const researcherBalBefore = await journalToken.balanceOf(researcher.address);

      const tx = await registry.connect(researcher).payPublicationFee(msId);

      // Both DOIMinted and DOIRegistered events emitted
      await expect(tx).to.emit(registry, "DOIMinted");
      await expect(tx).to.emit(registry, "DOIRegistered");
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.PUBLISHED);

      // Verify 3 IncentivePaid events (one per reviewer)
      const ms = await registry.getManuscript(msId);
      for (const reviewer of ms.reviewers) {
        await expect(tx).to.emit(registry, "IncentivePaid").withArgs(reviewer, REVIEWER_INCENTIVE);
      }

      // Final state checks
      expect(ms.status).to.equal(Status.PUBLISHED);

      // JRT deducted from researcher (100 JRT)
      const researcherBalAfter = await journalToken.balanceOf(researcher.address);
      expect(researcherBalBefore - researcherBalAfter).to.equal(PUBLICATION_FEE);

      // DOI NFT minted to the researcher
      const doiOwner = await doiToken.ownerOf(0);
      expect(doiOwner).to.equal(researcher.address);

      // Token URI must start with "ipfs://" and contain "?doi=10."
      const tokenURI = await doiToken.tokenURI(0);
      expect(tokenURI).to.match(/^ipfs:\/\//);
      expect(tokenURI).to.include("?doi=10.");

      // DOI field in manuscript struct must follow "10.XXXXX/..." format
      expect(ms.doi).to.match(/^10\.\d+\/.+/);

      console.log("    ✓ DOI Token ID 0 minted to:", researcher.address);
      console.log("    ✓ Token URI:", tokenURI);
      console.log("    ✓ DOI:", ms.doi);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 2: Plagiarism rejected
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Scenario 2: Submit → Plagiarism Rejected", function () {
    it("should reject manuscript when plagiarism score exceeds threshold", async function () {
      const cidBad = "QmBadPaperCopiedContent123";
      const metaBad = '{"title":"Copied Paper"}';

      await registry.connect(researcher).submitManuscript(cidBad, metaBad);
      // msId = 1 (second submission)

      // Fulfill with score=50 (above threshold of 30); plagiarismRequestId=1
      const tx = await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(1, 50);

      await expect(tx).to.emit(registry, "DecisionMade").withArgs(1, Status.REJECTED);

      const ms = await registry.getManuscript(1);
      expect(ms.status).to.equal(Status.REJECTED);
      expect(ms.plagiarismScore).to.equal(50);
      // No reviewers should be assigned
      expect(ms.reviewers.length).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 3: Revise → Resubmit → Accept → Publish
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Scenario 3: Submit → Revise → Resubmit → Accept → Publish", function () {
    let msId;
    let assignedReviewers;

    it("Step 1: Submit and pass plagiarism → UNDER_REVIEW", async function () {
      const cid = "QmOriginalDraftV1abc";
      await registry.connect(researcher).submitManuscript(cid, '{"title":"Draft V1"}');
      msId = 2; // third manuscript

      // plagiarismRequestId = 2
      await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(2, 10);

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.UNDER_REVIEW);
    });

    it("Step 1b: Oracle assigns reviewers → ReviewersAssigned", async function () {
      // reviewerSelectionRequestId = 1
      const selected = [reviewer1.address, reviewer2.address, reviewer3.address];
      await reviewOracle.connect(oracleOperator).fulfillReviewerSelection(1, selected);

      const ms = await registry.getManuscript(msId);
      expect(ms.reviewers.length).to.equal(3);
      assignedReviewers = ms.reviewers;
    });

    it("Step 2: Reviewers vote REVISE → REVISION_REQUESTED", async function () {
      const reviewHash = ethers.keccak256(ethers.toUtf8Bytes("Needs more work"));
      const signerMap = {};
      for (const r of [reviewer1, reviewer2, reviewer3, reviewer4, reviewer5]) {
        signerMap[r.address] = r;
      }

      // 2 REVISE + 1 ACCEPT = majority REVISE
      await registry.connect(signerMap[assignedReviewers[0]]).submitReview(msId, reviewHash, Verdict.REVISE);
      await registry.connect(signerMap[assignedReviewers[1]]).submitReview(msId, reviewHash, Verdict.REVISE);
      await registry.connect(signerMap[assignedReviewers[2]]).submitReview(msId, reviewHash, Verdict.ACCEPT);

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.REVISION_REQUESTED);
    });

    it("Step 3: Researcher revises → re-enters CHECKING", async function () {
      const newCid = "QmRevisedDraftV2xyz";
      const tx = await registry.connect(researcher).reviseManuscript(msId, newCid);

      await expect(tx).to.emit(registry, "ManuscriptRevised").withArgs(msId, newCid, 2);
      // New plagiarism check requested
      await expect(tx).to.emit(reviewOracle, "PlagiarismCheckRequested");

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.CHECKING);
      expect(ms.cid).to.equal(newCid);
      expect(ms.version).to.equal(2);
      expect(ms.acceptCount).to.equal(0);
      expect(ms.reviseCount).to.equal(0);
      expect(ms.reviewCount).to.equal(0);
    });

    it("Step 4: Second plagiarism check passes → UNDER_REVIEW + ReviewerSelectionRequested", async function () {
      // plagiarismRequestId = 3 (fourth plagiarism request overall)
      await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(3, 5);

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.UNDER_REVIEW);
    });

    it("Step 4b: Oracle assigns new reviewers", async function () {
      // reviewerSelectionRequestId = 2
      const selected = [reviewer3.address, reviewer4.address, reviewer5.address];
      await reviewOracle.connect(oracleOperator).fulfillReviewerSelection(2, selected);

      const ms = await registry.getManuscript(msId);
      expect(ms.reviewers.length).to.equal(3);
      assignedReviewers = ms.reviewers;
    });

    it("Step 5: New reviewers ACCEPT → ACCEPTED", async function () {
      const reviewHash = ethers.keccak256(ethers.toUtf8Bytes("Much improved!"));
      const signerMap = {};
      for (const r of [reviewer1, reviewer2, reviewer3, reviewer4, reviewer5]) {
        signerMap[r.address] = r;
      }
      for (const addr of assignedReviewers) {
        await registry.connect(signerMap[addr]).submitReview(msId, reviewHash, Verdict.ACCEPT);
      }

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.ACCEPTED);
    });

    it("Step 6: Pay fee and mint DOI", async function () {
      await journalToken.connect(researcher).approve(await registry.getAddress(), PUBLICATION_FEE);

      const tx = await registry.connect(researcher).payPublicationFee(msId);

      await expect(tx).to.emit(registry, "DOIMinted");
      await expect(tx).to.emit(registry, "DOIRegistered");
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.PUBLISHED);

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.PUBLISHED);
      expect(ms.doi).to.match(/^10\.\d+\/.+/);

      // DOI token #1 (second DOI minted overall)
      const doiOwner = await doiToken.ownerOf(1);
      expect(doiOwner).to.equal(researcher.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 4: Validate on-chain safety guards for reviewer selection
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Scenario 4: Reviewer selection guards", function () {
    it("should revert fulfillReviewerSelection with even count", async function () {
      // Submit a new manuscript to get a new reviewerSelectionRequestId
      // (we just need any pending reviewer request; for isolation, we create one)
      const cid = "QmGuardTest1";
      await registry.connect(researcher).submitManuscript(cid, '{"title":"Guard Test"}');
      // msId = 3; plagiarismRequestId = 4
      await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(4, 5);
      // reviewerSelectionRequestId = 3

      // Try to fulfill with even count (4) — must revert
      const evenReviewers = [
        reviewer1.address,
        reviewer2.address,
        reviewer3.address,
        reviewer4.address,
      ];
      await expect(
        reviewOracle.connect(oracleOperator).fulfillReviewerSelection(3, evenReviewers)
      ).to.be.revertedWithCustomError(reviewOracle, "InvalidReviewerCount");
    });

    it("should revert fulfillReviewerSelection with count < 3", async function () {
      // reviewerSelectionRequestId = 3 is still pending (previous even-count attempt reverted)
      const tooFew = [reviewer1.address, reviewer2.address];
      await expect(
        reviewOracle.connect(oracleOperator).fulfillReviewerSelection(3, tooFew)
      ).to.be.revertedWithCustomError(reviewOracle, "InvalidReviewerCount");
    });

    it("should accept fulfillReviewerSelection with 5 reviewers (odd ≥ 3)", async function () {
      // reviewerSelectionRequestId = 3 still pending
      const fiveReviewers = [
        reviewer1.address,
        reviewer2.address,
        reviewer3.address,
        reviewer4.address,
        reviewer5.address,
      ];
      const tx = await reviewOracle
        .connect(oracleOperator)
        .fulfillReviewerSelection(3, fiveReviewers);
      await expect(tx).to.emit(reviewOracle, "ReviewerSelectionFulfilled");

      const ms = await registry.getManuscript(3);
      expect(ms.reviewers.length).to.equal(5);
    });

    it("should revert fulfillReviewerSelection for already-fulfilled request", async function () {
      await expect(
        reviewOracle.connect(oracleOperator).fulfillReviewerSelection(3, [
          reviewer1.address,
          reviewer2.address,
          reviewer3.address,
        ])
      ).to.be.revertedWithCustomError(reviewOracle, "RequestAlreadyFulfilled");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 5: Verify token balances at the end
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Final Verification", function () {
    it("should have minted exactly 2 DOI NFTs (scenarios 1 and 3)", async function () {
      expect(await doiToken.ownerOf(0)).to.equal(researcher.address);
      expect(await doiToken.ownerOf(1)).to.equal(researcher.address);
      await expect(doiToken.ownerOf(2)).to.be.reverted;
    });

    it("should show all plagiarism requests 0-3 as fulfilled", async function () {
      for (let i = 0; i < 5; i++) {
        expect(await reviewOracle.plagiarismRequestFulfilled(i)).to.be.true;
      }
    });

    it("should show reviewer selection requests 0-3 as fulfilled", async function () {
      for (let i = 0; i < 4; i++) {
        expect(await reviewOracle.reviewerRequestFulfilled(i)).to.be.true;
      }
    });
  });
});
