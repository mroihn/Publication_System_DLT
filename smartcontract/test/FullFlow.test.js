const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  CID,
  METADATA,
  REVIEW_CID,
  REVIEW_COMMENTS,
  FIELD,
  EDITOR_CID,
  PUBLICATION_FEE,
  REVIEWER_INCENTIVE,
  Status,
  Verdict,
  buildDomain,
  makeSigners,
  deployFullSystem,
} = require("./helpers");

describe("Full Flow — Submit to DOI", function () {
  let journalToken, doiToken, reviewOracle, registry;
  let admin, oracleOperator, researcher;
  let reviewer1, reviewer2, reviewer3, reviewer4, reviewer5;
  let signers;

  function signerByAddress(address) {
    const all = [reviewer1, reviewer2, reviewer3, reviewer4, reviewer5];
    return all.find((r) => r.address === address);
  }

  before(async function () {
    [admin, oracleOperator, researcher, reviewer1, reviewer2, reviewer3, reviewer4, reviewer5] =
      await ethers.getSigners();

    ({ journalToken, doiToken, reviewOracle, registry } = await deployFullSystem({
      admin,
      oracleOperator,
      reviewers: [reviewer1, reviewer2, reviewer3, reviewer4, reviewer5],
    }));

    await journalToken.transfer(researcher.address, ethers.parseEther("500"));

    signers = makeSigners(registry, await buildDomain(registry));
  });

  describe("Scenario 1: Submit → Accept → Publish (Happy Path)", function () {
    let msId;
    let assignedReviewers;

    it("Step 1: Researcher signs and submits manuscript → CHECKING + PlagiarismCheckRequested emitted", async function () {
      const sig = await signers.manuscript(researcher, CID, METADATA);
      const tx = await registry.connect(admin).submitManuscript(CID, METADATA, sig.nonce, sig.v, sig.r, sig.s);
      msId = 0;

      await expect(tx).to.emit(registry, "ManuscriptSubmitted").withArgs(msId, researcher.address, CID);
      await expect(tx).to.emit(reviewOracle, "PlagiarismCheckRequested");

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.CHECKING);
      expect(ms.author).to.equal(researcher.address);
      expect(ms.cid).to.equal(CID);
      expect(ms.version).to.equal(1);
    });

    it("Step 2a: Oracle operator fulfills plagiarism check (score=15, pass) → PENDING_EDITOR (no reviewers yet)", async function () {
      const tx = await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(0, 15);

      await expect(tx).to.emit(reviewOracle, "PlagiarismCheckFulfilled").withArgs(0, 0, 15);
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.PENDING_EDITOR);
      await expect(tx).to.not.emit(reviewOracle, "ReviewerSelectionRequested");

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.PENDING_EDITOR);
      expect(ms.plagiarismScore).to.equal(15);
      expect(ms.reviewers.length).to.equal(0);
    });

    it("Step 2a-editor: Editor approves and assigns field → UNDER_REVIEW + ReviewerSelectionRequested", async function () {
      const tx = await registry.connect(admin).submitEditorReview(msId, true, FIELD, EDITOR_CID);

      await expect(tx).to.emit(registry, "EditorReviewed").withArgs(msId, true, FIELD, EDITOR_CID);
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.UNDER_REVIEW);
      await expect(tx).to.emit(reviewOracle, "ReviewerSelectionRequested");

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.UNDER_REVIEW);
      expect(ms.field).to.equal(FIELD);
      expect(await registry.getField(msId)).to.equal(FIELD);
    });

    it("Step 2b: Oracle operator fulfills reviewer selection (off-chain, 3 reviewers) → ReviewersAssigned", async function () {
      const selectedReviewers = [reviewer1.address, reviewer2.address, reviewer3.address];
      const tx = await reviewOracle.connect(oracleOperator).fulfillReviewerSelection(0, selectedReviewers);

      await expect(tx)
        .to.emit(reviewOracle, "ReviewerSelectionFulfilled")
        .withArgs(0, msId, selectedReviewers);
      await expect(tx).to.emit(registry, "ReviewersAssigned").withArgs(msId, selectedReviewers);

      const ms = await registry.getManuscript(msId);
      expect(ms.reviewers.length).to.equal(3);
      assignedReviewers = ms.reviewers;
    });

    it("Step 3: All 3 reviewers sign and submit ACCEPT verdicts → ACCEPTED", async function () {
      for (let i = 0; i < assignedReviewers.length; i++) {
        const signer = signerByAddress(assignedReviewers[i]);
        const d = await signers.review(signer, msId, REVIEW_COMMENTS, Verdict.ACCEPT);
        const tx = await registry
          .connect(admin)
          .submitReview(msId, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, d.nonce, d.v, d.r, d.s);

        await expect(tx)
          .to.emit(registry, "ReviewSubmitted")
          .withArgs(msId, signer.address, Verdict.ACCEPT, REVIEW_CID);

        if (i === assignedReviewers.length - 1) {
          await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.ACCEPTED);
        }
      }

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.ACCEPTED);
      expect(ms.acceptCount).to.equal(3);
      expect(ms.reviewCount).to.equal(3);
    });

    it("Step 4: Researcher approves JRT and pays publication fee → DOI minted (standard format) → PUBLISHED", async function () {
      await journalToken.connect(researcher).approve(await registry.getAddress(), PUBLICATION_FEE);
      const researcherBalBefore = await journalToken.balanceOf(researcher.address);

      const tx = await registry.connect(researcher).payPublicationFee(msId);

      await expect(tx).to.emit(registry, "DOIMinted");
      await expect(tx).to.emit(registry, "DOIRegistered");
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.PUBLISHED);

      const ms = await registry.getManuscript(msId);
      for (const reviewer of ms.reviewers) {
        await expect(tx).to.emit(registry, "IncentivePaid").withArgs(reviewer, REVIEWER_INCENTIVE);
      }

      expect(ms.status).to.equal(Status.PUBLISHED);
      expect(researcherBalBefore - (await journalToken.balanceOf(researcher.address))).to.equal(PUBLICATION_FEE);

      expect(await doiToken.ownerOf(0)).to.equal(researcher.address);

      const tokenURI = await doiToken.tokenURI(0);
      expect(tokenURI).to.match(/^ipfs:\/\//);
      expect(tokenURI).to.include("?doi=10.");
      expect(ms.doi).to.match(/^10\.\d+\/.+/);
    });
  });

  describe("Scenario 2: Submit → Plagiarism Rejected", function () {
    it("should reject manuscript when plagiarism score exceeds threshold", async function () {
      const cidBad = "QmBadPaperCopiedContent123";
      const metaBad = '{"title":"Copied Paper"}';

      const sig = await signers.manuscript(researcher, cidBad, metaBad);
      await registry.connect(admin).submitManuscript(cidBad, metaBad, sig.nonce, sig.v, sig.r, sig.s);

      const tx = await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(1, 50);
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(1, Status.REJECTED);

      const ms = await registry.getManuscript(1);
      expect(ms.status).to.equal(Status.REJECTED);
      expect(ms.plagiarismScore).to.equal(50);
      expect(ms.reviewers.length).to.equal(0);
    });
  });

  describe("Scenario 3: Submit → Revise → Resubmit → Accept → Publish", function () {
    let msId;
    let assignedReviewers;

    it("Step 1: Submit, pass plagiarism, editor approves → UNDER_REVIEW", async function () {
      const cid = "QmOriginalDraftV1abc";
      const meta = '{"title":"Draft V1"}';
      const sig = await signers.manuscript(researcher, cid, meta);
      await registry.connect(admin).submitManuscript(cid, meta, sig.nonce, sig.v, sig.r, sig.s);
      msId = 2;

      await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(2, 10);
      expect((await registry.getManuscript(msId)).status).to.equal(Status.PENDING_EDITOR);

      await registry.connect(admin).submitEditorReview(msId, true, FIELD, EDITOR_CID);
      expect((await registry.getManuscript(msId)).status).to.equal(Status.UNDER_REVIEW);
    });

    it("Step 1b: Oracle assigns reviewers → ReviewersAssigned", async function () {
      const selected = [reviewer1.address, reviewer2.address, reviewer3.address];
      await reviewOracle.connect(oracleOperator).fulfillReviewerSelection(1, selected);

      const ms = await registry.getManuscript(msId);
      expect(ms.reviewers.length).to.equal(3);
      assignedReviewers = ms.reviewers;
    });

    it("Step 2: Reviewers vote REVISE → REVISION_REQUESTED", async function () {
      const votes = [Verdict.REVISE, Verdict.REVISE, Verdict.ACCEPT];
      for (let i = 0; i < assignedReviewers.length; i++) {
        const signer = signerByAddress(assignedReviewers[i]);
        const d = await signers.review(signer, msId, REVIEW_COMMENTS, votes[i]);
        await registry
          .connect(admin)
          .submitReview(msId, REVIEW_CID, votes[i], REVIEW_COMMENTS, d.nonce, d.v, d.r, d.s);
      }

      expect((await registry.getManuscript(msId)).status).to.equal(Status.REVISION_REQUESTED);
    });

    it("Step 3: Researcher revises → re-enters CHECKING", async function () {
      const newCid = "QmRevisedDraftV2xyz";
      const sig = await signers.revise(researcher, msId, newCid);
      const tx = await registry.connect(admin).reviseManuscript(msId, newCid, sig.nonce, sig.v, sig.r, sig.s);

      await expect(tx).to.emit(registry, "ManuscriptRevised").withArgs(msId, newCid, 2);
      await expect(tx).to.emit(reviewOracle, "PlagiarismCheckRequested");

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.CHECKING);
      expect(ms.cid).to.equal(newCid);
      expect(ms.version).to.equal(2);
      expect(ms.acceptCount).to.equal(0);
      expect(ms.reviseCount).to.equal(0);
      expect(ms.reviewCount).to.equal(0);
    });

    it("Step 4: Second plagiarism check passes + editor approves → UNDER_REVIEW + ReviewerSelectionRequested", async function () {
      await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(3, 5);
      expect((await registry.getManuscript(msId)).status).to.equal(Status.PENDING_EDITOR);

      await registry.connect(admin).submitEditorReview(msId, true, FIELD, EDITOR_CID);
      expect((await registry.getManuscript(msId)).status).to.equal(Status.UNDER_REVIEW);
    });

    it("Step 4b: Oracle assigns new reviewers", async function () {
      const selected = [reviewer3.address, reviewer4.address, reviewer5.address];
      await reviewOracle.connect(oracleOperator).fulfillReviewerSelection(2, selected);

      const ms = await registry.getManuscript(msId);
      expect(ms.reviewers.length).to.equal(3);
      assignedReviewers = ms.reviewers;
    });

    it("Step 5: New reviewers ACCEPT → ACCEPTED", async function () {
      for (const addr of assignedReviewers) {
        const signer = signerByAddress(addr);
        const d = await signers.review(signer, msId, REVIEW_COMMENTS, Verdict.ACCEPT);
        await registry
          .connect(admin)
          .submitReview(msId, REVIEW_CID, Verdict.ACCEPT, REVIEW_COMMENTS, d.nonce, d.v, d.r, d.s);
      }

      expect((await registry.getManuscript(msId)).status).to.equal(Status.ACCEPTED);
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
      expect(await doiToken.ownerOf(1)).to.equal(researcher.address);
    });
  });

  describe("Scenario 4: Reviewer selection guards", function () {
    it("should revert fulfillReviewerSelection with even count", async function () {
      const cid = "QmGuardTest1";
      const meta = '{"title":"Guard Test"}';
      const sig = await signers.manuscript(researcher, cid, meta);
      await registry.connect(admin).submitManuscript(cid, meta, sig.nonce, sig.v, sig.r, sig.s);

      await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(4, 5);
      await registry.connect(admin).submitEditorReview(3, true, FIELD, EDITOR_CID);

      const evenReviewers = [reviewer1.address, reviewer2.address, reviewer3.address, reviewer4.address];
      await expect(
        reviewOracle.connect(oracleOperator).fulfillReviewerSelection(3, evenReviewers)
      ).to.be.revertedWithCustomError(reviewOracle, "InvalidReviewerCount");
    });

    it("should revert fulfillReviewerSelection with count < 3", async function () {
      const tooFew = [reviewer1.address, reviewer2.address];
      await expect(
        reviewOracle.connect(oracleOperator).fulfillReviewerSelection(3, tooFew)
      ).to.be.revertedWithCustomError(reviewOracle, "InvalidReviewerCount");
    });

    it("should accept fulfillReviewerSelection with 5 reviewers (odd ≥ 3)", async function () {
      const fiveReviewers = [
        reviewer1.address, reviewer2.address, reviewer3.address, reviewer4.address, reviewer5.address,
      ];
      const tx = await reviewOracle.connect(oracleOperator).fulfillReviewerSelection(3, fiveReviewers);
      await expect(tx).to.emit(reviewOracle, "ReviewerSelectionFulfilled");

      expect((await registry.getManuscript(3)).reviewers.length).to.equal(5);
    });

    it("should revert fulfillReviewerSelection for already-fulfilled request", async function () {
      await expect(
        reviewOracle.connect(oracleOperator).fulfillReviewerSelection(3, [
          reviewer1.address, reviewer2.address, reviewer3.address,
        ])
      ).to.be.revertedWithCustomError(reviewOracle, "RequestAlreadyFulfilled");
    });
  });

  describe("Scenario 5: Submit → Plagiarism Pass → Editor Desk-Reject", function () {
    const msId = 4;
    const cid = "QmOutOfScopePaper456";
    const metadata = '{"title":"Out of Scope Submission"}';

    it("Step 1: Researcher submits → CHECKING", async function () {
      const sig = await signers.manuscript(researcher, cid, metadata);
      await registry.connect(admin).submitManuscript(cid, metadata, sig.nonce, sig.v, sig.r, sig.s);

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.CHECKING);
      expect(ms.author).to.equal(researcher.address);
    });

    it("Step 2: Oracle fulfills plagiarism check (score=8, pass) → PENDING_EDITOR", async function () {
      const tx = await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(5, 8);
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.PENDING_EDITOR);

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.PENDING_EDITOR);
      expect(ms.plagiarismScore).to.equal(8);
    });

    it("Step 3: Editor rejects at screening → REJECTED, no reviewers ever requested", async function () {
      const requestsBefore = await reviewOracle.nextReviewerRequestId();

      const tx = await registry.connect(admin).submitEditorReview(msId, false, FIELD, EDITOR_CID);

      await expect(tx).to.emit(registry, "EditorReviewed").withArgs(msId, false, FIELD, EDITOR_CID);
      await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.REJECTED);
      await expect(tx).to.not.emit(reviewOracle, "ReviewerSelectionRequested");

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.REJECTED);
      expect(ms.reviewers.length).to.equal(0);
      expect(await reviewOracle.nextReviewerRequestId()).to.equal(requestsBefore);
    });

    it("Step 4: Rejected manuscript cannot be published", async function () {
      await journalToken.connect(researcher).approve(await registry.getAddress(), PUBLICATION_FEE);
      await expect(
        registry.connect(researcher).payPublicationFee(msId)
      ).to.be.revertedWithCustomError(registry, "InvalidState");
    });
  });

  describe("Scenario 6: Submit → Review → Majority Reject", function () {
    const msId = 5;
    const cid = "QmWeakMethodologyPaper789";
    const metadata = '{"title":"Insufficient Experimental Validation"}';
    let assignedReviewers;

    it("Step 1: Submit, pass plagiarism, editor approves → UNDER_REVIEW", async function () {
      const sig = await signers.manuscript(researcher, cid, metadata);
      await registry.connect(admin).submitManuscript(cid, metadata, sig.nonce, sig.v, sig.r, sig.s);

      await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(6, 12);
      expect((await registry.getManuscript(msId)).status).to.equal(Status.PENDING_EDITOR);

      await registry.connect(admin).submitEditorReview(msId, true, FIELD, EDITOR_CID);
      expect((await registry.getManuscript(msId)).status).to.equal(Status.UNDER_REVIEW);
    });

    it("Step 2: Oracle assigns 3 reviewers → ReviewersAssigned", async function () {
      const selected = [reviewer1.address, reviewer2.address, reviewer3.address];
      await reviewOracle.connect(oracleOperator).fulfillReviewerSelection(4, selected);

      const ms = await registry.getManuscript(msId);
      expect(ms.reviewers.length).to.equal(3);
      assignedReviewers = ms.reviewers;
    });

    it("Step 3: All 3 reviewers submit REJECT verdicts → REJECTED", async function () {
      const rejectComments = "Experimental validation is insufficient to support the claims.";

      for (let i = 0; i < assignedReviewers.length; i++) {
        const signer = signerByAddress(assignedReviewers[i]);
        const d = await signers.review(signer, msId, rejectComments, Verdict.REJECT);
        const tx = await registry
          .connect(admin)
          .submitReview(msId, REVIEW_CID, Verdict.REJECT, rejectComments, d.nonce, d.v, d.r, d.s);

        if (i === assignedReviewers.length - 1) {
          await expect(tx).to.emit(registry, "DecisionMade").withArgs(msId, Status.REJECTED);
        }
      }

      const ms = await registry.getManuscript(msId);
      expect(ms.status).to.equal(Status.REJECTED);
      expect(ms.rejectCount).to.equal(3);
      expect(ms.acceptCount).to.equal(0);
      expect(ms.reviewCount).to.equal(3);
    });

    it("Step 4: No DOI minted and no incentive paid for a rejected manuscript", async function () {
      await expect(doiToken.ownerOf(2)).to.be.reverted;
      expect((await registry.getManuscript(msId)).doi).to.equal("");

      await journalToken.connect(researcher).approve(await registry.getAddress(), PUBLICATION_FEE);
      await expect(
        registry.connect(researcher).payPublicationFee(msId)
      ).to.be.revertedWithCustomError(registry, "InvalidState");
    });
  });

  describe("Final Verification", function () {
    it("should have minted exactly 2 DOI NFTs (scenarios 1 and 3)", async function () {
      expect(await doiToken.ownerOf(0)).to.equal(researcher.address);
      expect(await doiToken.ownerOf(1)).to.equal(researcher.address);
      await expect(doiToken.ownerOf(2)).to.be.reverted;
    });

    it("should show all plagiarism requests 0-6 as fulfilled", async function () {
      for (let i = 0; i < 7; i++) {
        expect(await reviewOracle.plagiarismRequestFulfilled(i)).to.be.true;
      }
    });

    it("should show reviewer selection requests 0-4 as fulfilled", async function () {
      for (let i = 0; i < 5; i++) {
        expect(await reviewOracle.reviewerRequestFulfilled(i)).to.be.true;
      }
    });

    it("should record the expected final status for every manuscript", async function () {
      const expected = [
        Status.PUBLISHED,
        Status.REJECTED,
        Status.PUBLISHED,
        Status.UNDER_REVIEW,
        Status.REJECTED,
        Status.REJECTED,
      ];
      for (let i = 0; i < expected.length; i++) {
        expect(await registry.getStatus(i)).to.equal(expected[i]);
      }
    });
  });
});
