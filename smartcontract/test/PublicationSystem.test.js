const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const {
  CID,
  METADATA,
  FIELD,
  EDITOR_CID,
  PUBLICATION_FEE,
  REVIEWER_INCENTIVE,
  Status,
  Verdict,
  ROLES,
  buildDomain,
  makeSigners,
  deployTokens,
  deployRegistry,
  deployMockRegistry,
  createFlow,
} = require("./helpers");

describe("Publication System", function () {
  let journalToken, doiToken, registry;
  let admin, researcher, reviewer1, reviewer2, reviewer3, outsider;

  beforeEach(async function () {
    [admin, researcher, reviewer1, reviewer2, reviewer3, outsider] = await ethers.getSigners();

    ({ journalToken, doiToken } = await deployTokens());
    registry = await deployRegistry(doiToken, journalToken, admin.address, admin);

    await doiToken.grantRole(ROLES.MINTER, await registry.getAddress());
    await registry.grantRole(ROLES.RESEARCHER, researcher.address);
    await registry.grantRole(ROLES.REVIEWER, reviewer1.address);
    await registry.grantRole(ROLES.REVIEWER, reviewer2.address);
    await registry.grantRole(ROLES.REVIEWER, reviewer3.address);

    await journalToken.transfer(researcher.address, ethers.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("should deploy JournalToken with correct initial supply", async function () {
      expect(await journalToken.balanceOf(admin.address)).to.equal(ethers.parseEther("999000"));
    });

    it("should deploy DOIToken with MINTER_ROLE granted to registry", async function () {
      expect(await doiToken.hasRole(ROLES.MINTER, await registry.getAddress())).to.be.true;
    });

    it("should deploy PublicationRegistry as UUPS proxy", async function () {
      expect(await registry.nextManuscriptId()).to.equal(0);
    });

    it("should have correct roles assigned", async function () {
      expect(await registry.hasRole(ROLES.ADMIN, admin.address)).to.be.true;
      expect(await registry.hasRole(ROLES.RESEARCHER, researcher.address)).to.be.true;
      expect(await registry.hasRole(ROLES.REVIEWER, reviewer1.address)).to.be.true;
    });
  });

  describe("Manuscript Submission", function () {
    it("should revert if caller lacks OPERATOR_ROLE", async function () {
      await expect(
        registry.connect(outsider).submitManuscript(CID, METADATA, 0, 27, ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.reverted;
    });
  });

  describe("Full Lifecycle — Accept Path", function () {
    let mockRegistry, flow;

    beforeEach(async function () {
      ({ registry: mockRegistry } = await deployMockRegistry({
        doiToken,
        journalToken,
        admin,
        reviewers: [reviewer1, reviewer2, reviewer3],
      }));
      flow = createFlow(mockRegistry, admin, makeSigners(mockRegistry, await buildDomain(mockRegistry)));
    });

    it("should handle full publication flow with fee payment", async function () {
      const msId = await flow.toUnderReview({
        author: researcher,
        reviewers: [reviewer1, reviewer2, reviewer3],
        score: 5,
      });
      await flow.castVerdicts(msId, [
        [reviewer1, Verdict.ACCEPT],
        [reviewer2, Verdict.ACCEPT],
        [reviewer3, Verdict.ACCEPT],
      ]);

      expect((await mockRegistry.getManuscript(msId)).status).to.equal(Status.ACCEPTED);

      await journalToken.connect(researcher).approve(await mockRegistry.getAddress(), PUBLICATION_FEE);
      const tx = await mockRegistry.connect(researcher).payPublicationFee(msId);

      await expect(tx)
        .to.emit(mockRegistry, "IncentivePaid")
        .withArgs(reviewer1.address, REVIEWER_INCENTIVE);
      await expect(tx)
        .to.emit(mockRegistry, "DecisionMade")
        .withArgs(msId, Status.PUBLISHED);

      expect((await mockRegistry.getManuscript(msId)).status).to.equal(Status.PUBLISHED);
      expect(await journalToken.balanceOf(reviewer1.address)).to.equal(REVIEWER_INCENTIVE);
    });

    it("should revert payPublicationFee without sufficient allowance", async function () {
      const msId = await flow.toUnderReview({
        author: researcher,
        reviewers: [reviewer1, reviewer2, reviewer3],
        score: 5,
      });
      await flow.castVerdicts(msId, [
        [reviewer1, Verdict.ACCEPT],
        [reviewer2, Verdict.ACCEPT],
        [reviewer3, Verdict.ACCEPT],
      ]);

      await expect(
        mockRegistry.connect(researcher).payPublicationFee(msId)
      ).to.be.revertedWithCustomError(mockRegistry, "InsufficientAllowance");
    });

    it("should revert if non-author tries to pay fee", async function () {
      const msId = await flow.toUnderReview({
        author: researcher,
        reviewers: [reviewer1, reviewer2, reviewer3],
        score: 5,
      });
      await flow.castVerdicts(msId, [
        [reviewer1, Verdict.ACCEPT],
        [reviewer2, Verdict.ACCEPT],
        [reviewer3, Verdict.ACCEPT],
      ]);

      await expect(
        mockRegistry.connect(outsider).payPublicationFee(msId)
      ).to.be.revertedWithCustomError(mockRegistry, "NotAuthor");
    });
  });

  describe("State Machine — Direct Oracle Simulation", function () {
    let mockRegistry, flow;

    beforeEach(async function () {
      ({ registry: mockRegistry } = await deployMockRegistry({
        doiToken,
        journalToken,
        admin,
        reviewers: [reviewer1, reviewer2, reviewer3],
      }));
      flow = createFlow(mockRegistry, admin, makeSigners(mockRegistry, await buildDomain(mockRegistry)));
    });

    it("should submit manuscript and enter CHECKING state", async function () {
      const { tx, msId } = await flow.submit(researcher);

      await expect(tx)
        .to.emit(mockRegistry, "ManuscriptSubmitted")
        .withArgs(msId, researcher.address, CID);

      const ms = await mockRegistry.getManuscript(msId);
      expect(ms.status).to.equal(Status.CHECKING);
      expect(ms.author).to.equal(researcher.address);
      expect(ms.cid).to.equal(CID);
      expect(ms.version).to.equal(1);
    });

    it("should transition CHECKING → PENDING_EDITOR on plagiarism pass", async function () {
      const { msId } = await flow.submit(researcher);
      const tx = await flow.passPlagiarism(msId, 15);

      await expect(tx)
        .to.emit(mockRegistry, "DecisionMade")
        .withArgs(msId, Status.PENDING_EDITOR);

      const ms = await mockRegistry.getManuscript(msId);
      expect(ms.status).to.equal(Status.PENDING_EDITOR);
      expect(ms.plagiarismScore).to.equal(15);
    });

    it("should transition PENDING_EDITOR → UNDER_REVIEW on editor approval and assign the field", async function () {
      const { msId } = await flow.submit(researcher);
      await flow.passPlagiarism(msId, 15);
      const tx = await flow.editorApprove(msId);

      await expect(tx)
        .to.emit(mockRegistry, "EditorReviewed")
        .withArgs(msId, true, FIELD, EDITOR_CID);
      await expect(tx)
        .to.emit(mockRegistry, "DecisionMade")
        .withArgs(msId, Status.UNDER_REVIEW);

      const ms = await mockRegistry.getManuscript(msId);
      expect(ms.status).to.equal(Status.UNDER_REVIEW);
      expect(ms.field).to.equal(FIELD);
      expect(await mockRegistry.getField(msId)).to.equal(FIELD);
    });

    it("should desk-reject a manuscript when the editor rejects", async function () {
      const { msId } = await flow.submit(researcher);
      await flow.passPlagiarism(msId, 15);
      const tx = await flow.editorReject(msId);

      await expect(tx)
        .to.emit(mockRegistry, "DecisionMade")
        .withArgs(msId, Status.REJECTED);

      expect((await mockRegistry.getManuscript(msId)).status).to.equal(Status.REJECTED);
    });

    it("should record editor-verified reviewer fields on-chain", async function () {
      const fields = ["ai", "blockchain"];
      const tx = await mockRegistry.connect(admin).verifyReviewerFields(reviewer1.address, fields);
      await expect(tx)
        .to.emit(mockRegistry, "ReviewerFieldsVerified")
        .withArgs(reviewer1.address, fields);

      expect(await mockRegistry.getVerifiedFields(reviewer1.address)).to.deep.equal(fields);

      await mockRegistry.connect(admin).verifyReviewerFields(reviewer1.address, ["data-science"]);
      expect(await mockRegistry.getVerifiedFields(reviewer1.address)).to.deep.equal(["data-science"]);
    });

    it("should transition CHECKING → REJECTED on plagiarism fail", async function () {
      const { msId } = await flow.submit(researcher);
      const tx = await flow.passPlagiarism(msId, 50);

      await expect(tx)
        .to.emit(mockRegistry, "DecisionMade")
        .withArgs(msId, Status.REJECTED);

      expect((await mockRegistry.getManuscript(msId)).status).to.equal(Status.REJECTED);
    });

    it("should assign reviewers via fulfillRandomReviewers", async function () {
      const { msId } = await flow.submit(researcher);
      await flow.passPlagiarism(msId, 10);
      await flow.editorApprove(msId);

      const reviewers = [reviewer1.address, reviewer2.address, reviewer3.address];
      const tx = await flow.assignReviewers(msId, reviewers);

      await expect(tx)
        .to.emit(mockRegistry, "ReviewersAssigned")
        .withArgs(msId, reviewers);

      expect((await mockRegistry.getManuscript(msId)).reviewers.length).to.equal(3);
    });

    it("should handle review submission and majority ACCEPT", async function () {
      const msId = await flow.toUnderReview({
        author: researcher,
        reviewers: [reviewer1, reviewer2, reviewer3],
      });
      await flow.castVerdicts(msId, [
        [reviewer1, Verdict.ACCEPT],
        [reviewer2, Verdict.ACCEPT],
        [reviewer3, Verdict.REJECT],
      ]);

      const ms = await mockRegistry.getManuscript(msId);
      expect(ms.status).to.equal(Status.ACCEPTED);
      expect(ms.acceptCount).to.equal(2);
      expect(ms.rejectCount).to.equal(1);
    });

    it("should handle majority REJECT", async function () {
      const msId = await flow.toUnderReview({
        author: researcher,
        reviewers: [reviewer1, reviewer2, reviewer3],
      });
      await flow.castVerdicts(msId, [
        [reviewer1, Verdict.REJECT],
        [reviewer2, Verdict.REJECT],
        [reviewer3, Verdict.ACCEPT],
      ]);

      expect((await mockRegistry.getManuscript(msId)).status).to.equal(Status.REJECTED);
    });

    it("should handle majority REVISE", async function () {
      const msId = await flow.toUnderReview({
        author: researcher,
        reviewers: [reviewer1, reviewer2, reviewer3],
      });
      await flow.castVerdicts(msId, [
        [reviewer1, Verdict.REVISE],
        [reviewer2, Verdict.REVISE],
        [reviewer3, Verdict.ACCEPT],
      ]);

      expect((await mockRegistry.getManuscript(msId)).status).to.equal(Status.REVISION_REQUESTED);
    });

    it("should default to REVISION_REQUESTED when no verdict reaches a majority", async function () {
      const msId = await flow.toUnderReview({
        author: researcher,
        reviewers: [reviewer1, reviewer2, reviewer3],
      });
      const tx = await flow.castVerdicts(msId, [
        [reviewer1, Verdict.ACCEPT],
        [reviewer2, Verdict.REJECT],
        [reviewer3, Verdict.REVISE],
      ]);

      await expect(tx)
        .to.emit(mockRegistry, "DecisionMade")
        .withArgs(msId, Status.REVISION_REQUESTED);

      const ms = await mockRegistry.getManuscript(msId);
      expect(ms.status).to.equal(Status.REVISION_REQUESTED);
      expect(ms.acceptCount).to.equal(1);
      expect(ms.rejectCount).to.equal(1);
      expect(ms.reviseCount).to.equal(1);
    });

    it("should revert submitReview when the manuscript is not UNDER_REVIEW", async function () {
      const { msId } = await flow.submit(researcher);
      await flow.passPlagiarism(msId, 10);

      await expect(
        flow.review(reviewer1, msId, Verdict.ACCEPT)
      ).to.be.revertedWithCustomError(mockRegistry, "InvalidState");
    });

    it("should revert payPublicationFee when the manuscript is not ACCEPTED", async function () {
      const { msId } = await flow.submit(researcher);
      await flow.passPlagiarism(msId, 10);

      await journalToken.connect(researcher).approve(await mockRegistry.getAddress(), PUBLICATION_FEE);
      await expect(
        mockRegistry.connect(researcher).payPublicationFee(msId)
      ).to.be.revertedWithCustomError(mockRegistry, "InvalidState");
    });

    it("should prevent double review", async function () {
      const msId = await flow.toUnderReview({
        author: researcher,
        reviewers: [reviewer1, reviewer2, reviewer3],
      });
      await flow.review(reviewer1, msId, Verdict.ACCEPT);

      await expect(
        flow.review(reviewer1, msId, Verdict.ACCEPT)
      ).to.be.revertedWithCustomError(mockRegistry, "AlreadyReviewed");
    });

    it("should prevent non-assigned reviewer from submitting", async function () {
      const { msId } = await flow.submit(researcher);
      await flow.passPlagiarism(msId, 10);
      await flow.editorApprove(msId);
      await flow.assignReviewers(msId, [reviewer1, reviewer2]);

      await expect(
        flow.review(reviewer3, msId, Verdict.ACCEPT)
      ).to.be.revertedWithCustomError(mockRegistry, "NotAssignedReviewer");
    });

    it("should handle revise → resubmit flow", async function () {
      const msId = await flow.toUnderReview({
        author: researcher,
        reviewers: [reviewer1, reviewer2, reviewer3],
      });
      await flow.castVerdicts(msId, [
        [reviewer1, Verdict.REVISE],
        [reviewer2, Verdict.REVISE],
        [reviewer3, Verdict.REVISE],
      ]);

      expect((await mockRegistry.getManuscript(msId)).status).to.equal(Status.REVISION_REQUESTED);

      const newCID = "QmRevisedCID987654321";
      await flow.revise(researcher, msId, newCID);

      const ms = await mockRegistry.getManuscript(msId);
      expect(ms.status).to.equal(Status.CHECKING);
      expect(ms.cid).to.equal(newCID);
      expect(ms.version).to.equal(2);
      expect(ms.acceptCount).to.equal(0);
      expect(ms.rejectCount).to.equal(0);
      expect(ms.reviseCount).to.equal(0);
      expect(ms.reviewCount).to.equal(0);
    });

    it("should treat a plagiarism score equal to the threshold (30) as a pass", async function () {
      const { msId } = await flow.submit(researcher);
      await flow.passPlagiarism(msId, 30);

      expect((await mockRegistry.getManuscript(msId)).status).to.equal(Status.PENDING_EDITOR);
    });

    it("should reject a plagiarism score one above the threshold (31)", async function () {
      const { msId } = await flow.submit(researcher);
      await flow.passPlagiarism(msId, 31);

      expect((await mockRegistry.getManuscript(msId)).status).to.equal(Status.REJECTED);
    });

    it("should revert fulfillPlagiarism when the manuscript is not CHECKING", async function () {
      const { msId } = await flow.submit(researcher);
      await flow.passPlagiarism(msId, 10);

      await expect(
        flow.passPlagiarism(msId, 10)
      ).to.be.revertedWithCustomError(mockRegistry, "InvalidState");
    });

    it("should revert submitEditorReview when the manuscript is not PENDING_EDITOR", async function () {
      const { msId } = await flow.submit(researcher);

      await expect(
        flow.editorApprove(msId)
      ).to.be.revertedWithCustomError(mockRegistry, "InvalidState");
    });

    it("should revert fulfillRandomReviewers when the manuscript is not UNDER_REVIEW", async function () {
      const { msId } = await flow.submit(researcher);
      await flow.passPlagiarism(msId, 10);

      await expect(
        flow.assignReviewers(msId, [reviewer1, reviewer2, reviewer3])
      ).to.be.revertedWithCustomError(mockRegistry, "InvalidState");
    });

    it("should revert reviseManuscript when the manuscript is not REVISION_REQUESTED", async function () {
      const { msId } = await flow.submit(researcher);

      await expect(
        flow.revise(researcher, msId, "QmPrematureRevision")
      ).to.be.revertedWithCustomError(mockRegistry, "InvalidState");
    });

    it("should revert verifyReviewerFields for the zero address", async function () {
      await expect(
        mockRegistry.connect(admin).verifyReviewerFields(ethers.ZeroAddress, ["ai"])
      ).to.be.revertedWithCustomError(mockRegistry, "ZeroAddress");
    });

    it("should evaluate the majority correctly with five reviewers", async function () {
      const all = await ethers.getSigners();
      const reviewer4 = all[6];
      const reviewer5 = all[7];
      const panel = [reviewer1, reviewer2, reviewer3, reviewer4, reviewer5];

      const msId = await flow.toUnderReview({ author: researcher, reviewers: panel });

      const tx = await flow.castVerdicts(msId, [
        [reviewer1, Verdict.ACCEPT],
        [reviewer2, Verdict.ACCEPT],
        [reviewer3, Verdict.REJECT],
        [reviewer4, Verdict.REJECT],
        [reviewer5, Verdict.ACCEPT],
      ]);

      await expect(tx)
        .to.emit(mockRegistry, "DecisionMade")
        .withArgs(msId, Status.ACCEPTED);

      const ms = await mockRegistry.getManuscript(msId);
      expect(ms.status).to.equal(Status.ACCEPTED);
      expect(ms.acceptCount).to.equal(3);
      expect(ms.rejectCount).to.equal(2);
    });
  });

  describe("Signature & Nonce Security", function () {
    let secRegistry, domain, signers;

    beforeEach(async function () {
      ({ registry: secRegistry } = await deployMockRegistry({ doiToken, journalToken, admin }));
      domain = await buildDomain(secRegistry);
      signers = makeSigners(secRegistry, domain);
    });

    async function submitWithSig(cid, metadata, sig) {
      return secRegistry.connect(admin).submitManuscript(cid, metadata, sig.nonce, sig.v, sig.r, sig.s);
    }

    async function expectNotAttributedToResearcher(cid, metadata, sig) {
      let attributedAuthor;
      try {
        await submitWithSig(cid, metadata, sig);
        attributedAuthor = (await secRegistry.getManuscript(0)).author;
      } catch {
        return;
      }
      expect(attributedAuthor).to.not.equal(researcher.address);
    }

    it("should recover the true signer as author from a valid signature", async function () {
      const sig = await signers.manuscript(researcher, CID, METADATA);
      await submitWithSig(CID, METADATA, sig);

      const ms = await secRegistry.getManuscript(0);
      expect(ms.author).to.equal(researcher.address);
      expect(ms.author).to.not.equal(admin.address);
      expect(await secRegistry.nonces(researcher.address)).to.equal(1);
    });

    it("should reject a replayed nonce (anti-replay protection)", async function () {
      const sig = await signers.manuscript(researcher, CID, METADATA);
      await submitWithSig(CID, METADATA, sig);

      await expect(
        submitWithSig(CID, METADATA, sig)
      ).to.be.revertedWithCustomError(secRegistry, "InvalidSignature");
    });

    it("should not attribute a tampered signature to the original signer", async function () {
      const sig = await signers.manuscript(researcher, CID, METADATA);
      const tamperedS = ethers.keccak256(ethers.toUtf8Bytes("tampered"));
      await expectNotAttributedToResearcher(CID, METADATA, { ...sig, s: tamperedS });
    });

    it("should not attribute a signature to the signer when the payload was altered", async function () {
      const sig = await signers.manuscript(researcher, CID, METADATA);
      await expectNotAttributedToResearcher("QmDifferentCID", METADATA, sig);
    });

    it("should not attribute a foreign-domain signature to the original signer", async function () {
      const foreignDomain = { ...domain, verifyingContract: await journalToken.getAddress() };
      const foreignSigners = makeSigners(secRegistry, foreignDomain);
      const sig = await foreignSigners.manuscript(researcher, CID, METADATA);
      await expectNotAttributedToResearcher(CID, METADATA, sig);
    });

    it("should reject reviseManuscript signed by a non-author", async function () {
      const flow = createFlow(secRegistry, admin, signers);
      const msId = await flow.toUnderReview({
        author: researcher,
        reviewers: [reviewer1, reviewer2, reviewer3],
      });
      await flow.castVerdicts(msId, [
        [reviewer1, Verdict.REVISE],
        [reviewer2, Verdict.REVISE],
        [reviewer3, Verdict.REVISE],
      ]);
      expect((await secRegistry.getManuscript(msId)).status).to.equal(Status.REVISION_REQUESTED);

      const bad = await signers.revise(outsider, msId, "QmHijackedCID");
      await expect(
        secRegistry.connect(admin).reviseManuscript(msId, "QmHijackedCID", bad.nonce, bad.v, bad.r, bad.s)
      ).to.be.revertedWithCustomError(secRegistry, "NotAuthor");
    });

    it("should expose a domain separator bound to this contract", async function () {
      const separator = await secRegistry.domainSeparator();
      expect(separator).to.not.equal(ethers.ZeroHash);
      expect(separator).to.equal(ethers.TypedDataEncoder.hashDomain(domain));
    });
  });

  describe("DOIToken", function () {
    it("should revert mint from an account without MINTER_ROLE", async function () {
      await expect(
        doiToken.connect(outsider).mint(outsider.address, "ipfs://unauthorized")
      ).to.be.reverted;
    });

    it("should revert mint to the zero address", async function () {
      await doiToken.grantRole(ROLES.MINTER, admin.address);
      await expect(
        doiToken.mint(ethers.ZeroAddress, "ipfs://testURI")
      ).to.be.revertedWithCustomError(doiToken, "MintToZeroAddress");
    });

    it("should store the tokenURI exactly as provided", async function () {
      await doiToken.grantRole(ROLES.MINTER, admin.address);
      const uri = "ipfs://QmTestCID123456789abcdef?doi=10.55121/2026.31337.0.1";
      await doiToken.mint(researcher.address, uri);

      expect(await doiToken.tokenURI(0)).to.equal(uri);
      expect(await doiToken.ownerOf(0)).to.equal(researcher.address);
    });

    it("should allow posting comments on existing DOI", async function () {
      await doiToken.grantRole(ROLES.MINTER, admin.address);
      await doiToken.mint(researcher.address, "ipfs://testURI");

      const commentHash = ethers.keccak256(ethers.toUtf8Bytes("Interesting paper!"));
      await expect(doiToken.connect(outsider).postComment(0, commentHash))
        .to.emit(doiToken, "CommentPosted")
        .withArgs(0, outsider.address, commentHash);
    });

    it("should revert comment on non-existent DOI", async function () {
      const commentHash = ethers.keccak256(ethers.toUtf8Bytes("Comment on nothing"));
      await expect(doiToken.connect(outsider).postComment(999, commentHash)).to.be.reverted;
    });
  });

  describe("JournalToken", function () {
    it("should mint tokens only with MINTER_ROLE", async function () {
      await expect(
        journalToken.connect(outsider).mint(outsider.address, ethers.parseEther("100"))
      ).to.be.reverted;
    });

    it("should allow admin to mint additional tokens", async function () {
      await journalToken.mint(outsider.address, ethers.parseEther("500"));
      expect(await journalToken.balanceOf(outsider.address)).to.equal(ethers.parseEther("500"));
    });

    it("should revert minting zero amount", async function () {
      await expect(
        journalToken.mint(outsider.address, 0)
      ).to.be.revertedWithCustomError(journalToken, "MintAmountZero");
    });

    it("should revert minting to the zero address", async function () {
      await expect(
        journalToken.mint(ethers.ZeroAddress, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(journalToken, "MintToZeroAddress");
    });
  });

  describe("Access Control", function () {
    it("should prevent unauthorized UUPS upgrade", async function () {
      const PublicationRegistry = await ethers.getContractFactory("PublicationRegistry");
      await expect(
        upgrades.upgradeProxy(await registry.getAddress(), PublicationRegistry.connect(outsider), {
          kind: "uups",
        })
      ).to.be.reverted;
    });

    it("should prevent a non-ORACLE_ROLE account from fulfilling a plagiarism check", async function () {
      await expect(registry.connect(outsider).fulfillPlagiarism(0, 10)).to.be.reverted;
    });

    it("should prevent a non-ORACLE_ROLE account from assigning reviewers", async function () {
      await expect(
        registry.connect(outsider).fulfillRandomReviewers(0, [
          reviewer1.address, reviewer2.address, reviewer3.address,
        ])
      ).to.be.reverted;
    });

    it("should prevent a non-OPERATOR_ROLE account from submitting an editor decision", async function () {
      await expect(
        registry.connect(outsider).submitEditorReview(0, true, FIELD, EDITOR_CID)
      ).to.be.reverted;
    });

    it("should prevent a non-OPERATOR_ROLE account from verifying reviewer fields", async function () {
      await expect(
        registry.connect(outsider).verifyReviewerFields(reviewer1.address, ["ai"])
      ).to.be.reverted;
    });

    it("should prevent a non-ADMIN_ROLE account from granting the operator role", async function () {
      await expect(registry.connect(outsider).addOperator(outsider.address)).to.be.reverted;
    });

    it("should prevent a non-REGISTRY_ROLE account from requesting oracle services", async function () {
      const ReviewOracle = await ethers.getContractFactory("ReviewOracle");
      const oracle = await ReviewOracle.deploy();
      await oracle.waitForDeployment();
      await oracle.setPublicationRegistry(await registry.getAddress());

      await expect(oracle.connect(outsider).requestPlagiarismCheck(0, CID)).to.be.reverted;
      await expect(oracle.connect(outsider).requestRandomReviewers(0)).to.be.reverted;
    });

    it("should prevent a non-ORACLE_ROLE account from fulfilling oracle requests", async function () {
      const ReviewOracle = await ethers.getContractFactory("ReviewOracle");
      const oracle = await ReviewOracle.deploy();
      await oracle.waitForDeployment();

      await expect(oracle.connect(outsider).fulfillPlagiarismCheck(0, 10)).to.be.reverted;
      await expect(
        oracle.connect(outsider).fulfillReviewerSelection(0, [
          reviewer1.address, reviewer2.address, reviewer3.address,
        ])
      ).to.be.reverted;
    });
  });

  describe("Upgradeability", function () {
    let mockRegistry, flow;

    beforeEach(async function () {
      ({ registry: mockRegistry } = await deployMockRegistry({
        doiToken,
        journalToken,
        admin,
        reviewers: [reviewer1, reviewer2, reviewer3],
      }));
      flow = createFlow(mockRegistry, admin, makeSigners(mockRegistry, await buildDomain(mockRegistry)));
    });

    it("should preserve manuscript state across an authorized UUPS upgrade", async function () {
      const { msId } = await flow.submit(researcher);
      await flow.passPlagiarism(msId, 15);

      const before = await mockRegistry.getManuscript(msId);
      const nextIdBefore = await mockRegistry.nextManuscriptId();

      const PublicationRegistry = await ethers.getContractFactory("PublicationRegistry");
      const upgraded = await upgrades.upgradeProxy(await mockRegistry.getAddress(), PublicationRegistry, {
        kind: "uups",
      });
      await upgraded.waitForDeployment();

      expect(await upgraded.getAddress()).to.equal(await mockRegistry.getAddress());

      const after = await upgraded.getManuscript(msId);
      expect(after.author).to.equal(before.author);
      expect(after.cid).to.equal(before.cid);
      expect(after.status).to.equal(Status.PENDING_EDITOR);
      expect(await upgraded.nextManuscriptId()).to.equal(nextIdBefore);
    });
  });
});
