const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Full Flow Integration Test
 *
 * Tests the complete publication lifecycle using ALL real contracts
 * (no mocks), following the sequence diagram in diagram.md:
 *
 *   Researcher → submitManuscript → ReviewOracle emits PlagiarismCheckRequested
 *   Oracle Operator → fulfillPlagiarismCheck → ReviewOracle → Registry.fulfillPlagiarism
 *   Registry → requestRandomReviewers → ReviewOracle selects via prevrandao → Registry.fulfillRandomReviewers
 *   Reviewers → submitReview (×3)
 *   Researcher → approve JRT → payPublicationFee → DOI minted → PUBLISHED
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
    roles.REVIEWER = ethers.keccak256(ethers.toUtf8Bytes("REVIEWER_ROLE"));
    roles.ORACLE = ethers.keccak256(ethers.toUtf8Bytes("ORACLE_ROLE"));
    roles.ADMIN = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
    roles.MINTER = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    roles.REGISTRY = ethers.keccak256(ethers.toUtf8Bytes("REGISTRY_ROLE"));

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

    // ReviewOracle: link to Registry
    await reviewOracle.setPublicationRegistry(await registry.getAddress());

    // ReviewOracle: grant ORACLE_ROLE to oracleOperator
    await reviewOracle.grantRole(roles.ORACLE, oracleOperator.address);

    // ReviewOracle: register reviewers in the pool (need ≥ 3)
    await reviewOracle.addReviewer(reviewer1.address);
    await reviewOracle.addReviewer(reviewer2.address);
    await reviewOracle.addReviewer(reviewer3.address);
    await reviewOracle.addReviewer(reviewer4.address);
    await reviewOracle.addReviewer(reviewer5.address);

    // Registry: grant RESEARCHER_ROLE
    await registry.grantRole(roles.RESEARCHER, researcher.address);

    // Registry: grant REVIEWER_ROLE to all potential reviewers
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

    it("Step 1: Researcher submits manuscript → CHECKING", async function () {
      const tx = await registry.connect(researcher).submitManuscript(CID, METADATA);
      const receipt = await tx.wait();

      // ManuscriptSubmitted from Registry
      await expect(tx)
        .to.emit(registry, "ManuscriptSubmitted")
        .withArgs(0, CID);

      // PlagiarismCheckRequested from ReviewOracle
      await expect(tx).to.emit(reviewOracle, "PlagiarismCheckRequested");

      msId = 0;
      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.CHECKING);
      expect(ms.author).to.equal(researcher.address);
      expect(ms.cid).to.equal(CID);
      expect(ms.version).to.equal(1);
    });

    it("Step 2: Oracle operator fulfills plagiarism check (score=15, pass) → UNDER_REVIEW", async function () {
      // requestId = 0 (first request)
      const tx = await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(0, 15);

      // PlagiarismCheckFulfilled from ReviewOracle
      await expect(tx).to.emit(reviewOracle, "PlagiarismCheckFulfilled").withArgs(0, msId, 15);

      // DecisionMade(UNDER_REVIEW) from Registry
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.UNDER_REVIEW);

      // RandomReviewersSelected from ReviewOracle (on-chain selection)
      await expect(tx).to.emit(reviewOracle, "RandomReviewersSelected");

      // ReviewersAssigned from Registry
      await expect(tx).to.emit(registry, "ReviewersAssigned");

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.UNDER_REVIEW);
      expect(ms.plagiarismScore).to.equal(15);
      expect(ms.reviewers.length).to.equal(3);

      // Save assigned reviewers for subsequent steps
      assignedReviewers = ms.reviewers;
      console.log("    Assigned reviewers:", assignedReviewers);
    });

    it("Step 3: All 3 reviewers submit ACCEPT verdicts → ACCEPTED", async function () {
      const reviewHash = ethers.keccak256(ethers.toUtf8Bytes("Excellent research!"));

      // Map assigned addresses to signers
      const allReviewers = [reviewer1, reviewer2, reviewer3, reviewer4, reviewer5];
      const signerMap = {};
      for (const r of allReviewers) {
        signerMap[r.address] = r;
      }

      // First two reviewers — no state change yet
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

    it("Step 4: Researcher approves JRT and pays publication fee → DOI minted → PUBLISHED", async function () {
      // Approve JRT
      await journalToken.connect(researcher).approve(await registry.getAddress(), PUBLICATION_FEE);

      // Record balances before
      const researcherBalBefore = await journalToken.balanceOf(researcher.address);

      // Pay publication fee
      const tx = await registry.connect(researcher).payPublicationFee(msId);

      // Verify events
      await expect(tx).to.emit(registry, "DOIMinted");
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.PUBLISHED);

      // Verify 3 IncentivePaid events (one per reviewer)
      const ms = await registry.getManuscript(msId);
      for (const reviewer of ms.reviewers) {
        await expect(tx)
          .to.emit(registry, "IncentivePaid")
          .withArgs(reviewer, REVIEWER_INCENTIVE);
      }

      // Verify final state
      expect(ms.status).to.equal(Status.PUBLISHED);

      // Verify JRT deducted from researcher (100 JRT)
      const researcherBalAfter = await journalToken.balanceOf(researcher.address);
      expect(researcherBalBefore - researcherBalAfter).to.equal(PUBLICATION_FEE);

      // Verify DOI NFT was minted to the researcher
      const doiOwner = await doiToken.ownerOf(0); // first DOI token
      expect(doiOwner).to.equal(researcher.address);

      // Verify DOI token URI points to manuscript CID
      const tokenURI = await doiToken.tokenURI(0);
      expect(tokenURI).to.equal(`ipfs://${CID}`);

      console.log("    ✓ DOI Token ID 0 minted to:", researcher.address);
      console.log("    ✓ Token URI:", tokenURI);
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

      // Fulfill with score=50 (above threshold of 30)
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

    it("Step 1: Submit and pass plagiarism", async function () {
      const cid = "QmOriginalDraftV1abc";
      await registry.connect(researcher).submitManuscript(cid, '{"title":"Draft V1"}');
      msId = 2; // third manuscript

      await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(2, 10);

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.UNDER_REVIEW);
      assignedReviewers = ms.reviewers;
    });

    it("Step 2: Reviewers vote REVISE → REVISION_REQUESTED", async function () {
      const reviewHash = ethers.keccak256(ethers.toUtf8Bytes("Needs more work"));
      const allReviewers = [reviewer1, reviewer2, reviewer3, reviewer4, reviewer5];
      const signerMap = {};
      for (const r of allReviewers) signerMap[r.address] = r;

      // 2 REVISE + 1 ACCEPT = majority REVISE
      await registry
        .connect(signerMap[assignedReviewers[0]])
        .submitReview(msId, reviewHash, Verdict.REVISE);
      await registry
        .connect(signerMap[assignedReviewers[1]])
        .submitReview(msId, reviewHash, Verdict.REVISE);
      await registry
        .connect(signerMap[assignedReviewers[2]])
        .submitReview(msId, reviewHash, Verdict.ACCEPT);

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.REVISION_REQUESTED);
    });

    it("Step 3: Researcher revises → re-enters CHECKING", async function () {
      const newCid = "QmRevisedDraftV2xyz";
      const tx = await registry.connect(researcher).reviseManuscript(msId, newCid);

      await expect(tx)
        .to.emit(registry, "ManuscriptRevised")
        .withArgs(msId, newCid, 2);

      // Should emit a new PlagiarismCheckRequested
      await expect(tx).to.emit(reviewOracle, "PlagiarismCheckRequested");

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.CHECKING);
      expect(ms.cid).to.equal(newCid);
      expect(ms.version).to.equal(2);
      // Review counters must be reset
      expect(ms.acceptCount).to.equal(0);
      expect(ms.reviseCount).to.equal(0);
      expect(ms.reviewCount).to.equal(0);
    });

    it("Step 4: Second plagiarism check passes → new reviewers assigned", async function () {
      // requestId = 3 (fourth plagiarism request overall)
      await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(3, 5);

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.UNDER_REVIEW);
      expect(ms.reviewers.length).to.equal(3);
      assignedReviewers = ms.reviewers;
    });

    it("Step 5: New reviewers ACCEPT → ACCEPTED", async function () {
      const reviewHash = ethers.keccak256(ethers.toUtf8Bytes("Much improved!"));
      const allReviewers = [reviewer1, reviewer2, reviewer3, reviewer4, reviewer5];
      const signerMap = {};
      for (const r of allReviewers) signerMap[r.address] = r;

      for (const addr of assignedReviewers) {
        await registry
          .connect(signerMap[addr])
          .submitReview(msId, reviewHash, Verdict.ACCEPT);
      }

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.ACCEPTED);
    });

    it("Step 6: Pay fee and mint DOI", async function () {
      await journalToken
        .connect(researcher)
        .approve(await registry.getAddress(), PUBLICATION_FEE);

      const tx = await registry.connect(researcher).payPublicationFee(msId);

      await expect(tx).to.emit(registry, "DOIMinted");
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.PUBLISHED);

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.PUBLISHED);

      // DOI token #1 (second DOI minted overall)
      const doiOwner = await doiToken.ownerOf(1);
      expect(doiOwner).to.equal(researcher.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 4: Verify token balances at the end
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Final Verification", function () {
    it("should have correct JRT balances after all scenarios", async function () {
      // Researcher started with 500 JRT, paid 100 twice = 300 remaining
      const researcherBal = await journalToken.balanceOf(researcher.address);
      expect(researcherBal).to.equal(ethers.parseEther("300"));
    });

    it("should have minted exactly 2 DOI NFTs", async function () {
      // Token IDs 0 and 1 should exist
      expect(await doiToken.ownerOf(0)).to.equal(researcher.address);
      expect(await doiToken.ownerOf(1)).to.equal(researcher.address);

      // Token ID 2 should not exist
      await expect(doiToken.ownerOf(2)).to.be.reverted;
    });

    it("should show all plagiarism requests as fulfilled", async function () {
      // Requests 0, 1, 2, 3 were all fulfilled
      for (let i = 0; i < 4; i++) {
        expect(await reviewOracle.requestFulfilled(i)).to.be.true;
      }
    });
  });
});
