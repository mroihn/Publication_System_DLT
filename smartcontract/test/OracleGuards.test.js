const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  CID,
  METADATA,
  ROLES,
  buildDomain,
  makeSigners,
  deployFullSystem,
} = require("./helpers");

describe("ReviewOracle Guards", function () {
  let reviewOracle, registry;
  let admin, oracleOperator, researcher, reviewer1, reviewer2, reviewer3;
  let signers;

  beforeEach(async function () {
    [admin, oracleOperator, researcher, reviewer1, reviewer2, reviewer3] = await ethers.getSigners();

    ({ reviewOracle, registry } = await deployFullSystem({
      admin,
      oracleOperator,
      reviewers: [reviewer1, reviewer2, reviewer3],
    }));

    signers = makeSigners(registry, await buildDomain(registry));
  });

  async function submitManuscript() {
    const sig = await signers.manuscript(researcher, CID, METADATA);
    await registry.connect(admin).submitManuscript(CID, METADATA, sig.nonce, sig.v, sig.r, sig.s);
  }

  describe("Request fulfillment guards", function () {
    it("should revert fulfillPlagiarismCheck for an unknown request id", async function () {
      await expect(
        reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(0, 10)
      ).to.be.revertedWithCustomError(reviewOracle, "RequestNotFound");
    });

    it("should revert fulfillReviewerSelection for an unknown request id", async function () {
      await expect(
        reviewOracle.connect(oracleOperator).fulfillReviewerSelection(0, [
          reviewer1.address, reviewer2.address, reviewer3.address,
        ])
      ).to.be.revertedWithCustomError(reviewOracle, "RequestNotFound");
    });

    it("should revert fulfillPlagiarismCheck for a score above 100", async function () {
      await submitManuscript();

      await expect(
        reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(0, 150)
      ).to.be.revertedWithCustomError(reviewOracle, "InvalidScore");
    });

    it("should revert fulfillPlagiarismCheck for an already-fulfilled request", async function () {
      await submitManuscript();
      await reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(0, 10);

      await expect(
        reviewOracle.connect(oracleOperator).fulfillPlagiarismCheck(0, 10)
      ).to.be.revertedWithCustomError(reviewOracle, "RequestAlreadyFulfilled");
    });
  });

  describe("setPublicationRegistry", function () {
    let bareOracle;

    beforeEach(async function () {
      const ReviewOracle = await ethers.getContractFactory("ReviewOracle");
      bareOracle = await ReviewOracle.deploy();
      await bareOracle.waitForDeployment();
    });

    it("should revert when setting the zero address", async function () {
      await expect(
        bareOracle.connect(admin).setPublicationRegistry(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(bareOracle, "OracleZeroAddress");
    });

    it("should revert when called by a non-admin account", async function () {
      await expect(
        bareOracle.connect(researcher).setPublicationRegistry(reviewer1.address)
      ).to.be.reverted;
    });

    it("should move REGISTRY_ROLE from the previous registry to the new one", async function () {
      const first = reviewer1.address;
      const second = reviewer2.address;

      await bareOracle.connect(admin).setPublicationRegistry(first);
      expect(await bareOracle.hasRole(ROLES.REGISTRY, first)).to.be.true;

      await bareOracle.connect(admin).setPublicationRegistry(second);
      expect(await bareOracle.hasRole(ROLES.REGISTRY, first)).to.be.false;
      expect(await bareOracle.hasRole(ROLES.REGISTRY, second)).to.be.true;
      expect(await bareOracle.publicationRegistry()).to.equal(second);
    });
  });
});
