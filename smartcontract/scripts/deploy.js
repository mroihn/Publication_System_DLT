const { ethers, upgrades } = require("hardhat");

//  * Deployment script for the Decentralized Publication System.
//  *
//  * Deployment order (dependency-aware):
//  *   1. JournalToken  (ERC-20)
//  *   2. DOIToken      (ERC-721)
//  *   3. ReviewOracle  (Custom Oracle)
//  *   4. PublicationRegistry (UUPS Proxy)
//  *   5. Post-deployment configuration (roles, permissions)
//  *
//  * Required environment variables:
//  *   PRIVATE_KEY
//  */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  // JournalToken initial supply (in whole tokens)
  const INITIAL_JRT_SUPPLY = 1_000_000;

  // ─────────────────── 1. Deploy JournalToken ───────────────────

  console.log("\n[1/4] Deploying JournalToken...");
  const JournalToken = await ethers.getContractFactory("JournalToken");
  const journalToken = await JournalToken.deploy(INITIAL_JRT_SUPPLY);
  await journalToken.waitForDeployment();
  const journalTokenAddr = await journalToken.getAddress();
  console.log("  JournalToken deployed at:", journalTokenAddr);

  // ─────────────────── 2. Deploy DOIToken ───────────────────────

  console.log("\n[2/4] Deploying DOIToken...");
  const DOIToken = await ethers.getContractFactory("DOIToken");
  const doiToken = await DOIToken.deploy();
  await doiToken.waitForDeployment();
  const doiTokenAddr = await doiToken.getAddress();
  console.log("  DOIToken deployed at:", doiTokenAddr);

  // ─────────────────── 3. Deploy ReviewOracle ───────────────────

  console.log("\n[3/4] Deploying ReviewOracle...");
  const ReviewOracle = await ethers.getContractFactory("ReviewOracle");
  const reviewOracle = await ReviewOracle.deploy();
  await reviewOracle.waitForDeployment();
  const reviewOracleAddr = await reviewOracle.getAddress();
  console.log("  ReviewOracle deployed at:", reviewOracleAddr);

  // ─────────────────── 4. Deploy PublicationRegistry (UUPS) ─────

  console.log("\n[4/4] Deploying PublicationRegistry (UUPS Proxy)...");
  const PublicationRegistry = await ethers.getContractFactory(
    "PublicationRegistry"
  );
  const registry = await upgrades.deployProxy(
    PublicationRegistry,
    [doiTokenAddr, journalTokenAddr, reviewOracleAddr, deployer.address],
    {
      initializer: "initialize",
      kind: "uups",
    }
  );
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("  PublicationRegistry proxy deployed at:", registryAddr);

  // ─────────────────── 5. Post-deployment Configuration ─────────

  console.log("\n─── Post-deployment Configuration ───");

  // Grant MINTER_ROLE on DOIToken to PublicationRegistry
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  let tx = await doiToken.grantRole(MINTER_ROLE, registryAddr);
  await tx.wait();
  console.log("  ✓ Granted MINTER_ROLE on DOIToken to PublicationRegistry");

  // Set PublicationRegistry on ReviewOracle
  tx = await reviewOracle.setPublicationRegistry(registryAddr);
  await tx.wait();
  console.log("  ✓ Set PublicationRegistry address on ReviewOracle");

  // ─────────────────── Summary ──────────────────────────────────

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║         DEPLOYMENT COMPLETE                      ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ JournalToken          : ${journalTokenAddr} ║`);
  console.log(`║ DOIToken              : ${doiTokenAddr} ║`);
  console.log(`║ ReviewOracle          : ${reviewOracleAddr} ║`);
  console.log(`║ PublicationRegistry   : ${registryAddr} ║`);
  console.log("╠══════════════════════════════════════════════════╣");
  console.log("║ NEXT STEPS:                                      ║");
  console.log("║  1. Add reviewers via ReviewOracle.addReviewer()   ║");
  console.log("║  2. Grant REVIEWER_ROLE on Registry               ║");
  console.log("║  3. Grant RESEARCHER_ROLE to users                 ║");
  console.log("║  4. Set up off-chain oracle to listen for          ║");
  console.log("║     PlagiarismCheckRequested events                ║");
  console.log("╚══════════════════════════════════════════════════╝");

  // Return addresses for verification scripts
  return {
    journalToken: journalTokenAddr,
    doiToken: doiTokenAddr,
    reviewOracle: reviewOracleAddr,
    publicationRegistry: registryAddr,
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
