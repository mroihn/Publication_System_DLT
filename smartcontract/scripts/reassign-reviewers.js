/**
 * Reassigns the reviewer list for a given manuscript to a set of real addresses.
 *
 * Usage:
 *   MS_ID=9 REVIEWERS=0xAddr1,0xAddr2,0xAddr3 \
 *     npx hardhat run scripts/reassign-reviewers.js --network sepolia
 *
 * The script temporarily grants ORACLE_ROLE to the admin wallet, calls
 * fulfillRandomReviewers(), then revokes the temporary role.
 */
const hre = require("hardhat");

async function main() {
  const [admin] = await hre.ethers.getSigners();
  console.log("Admin:", admin.address);

  const registryAddress = process.env.REGISTRY_CONTRACT_ADDRESS;
  if (!registryAddress) throw new Error("REGISTRY_CONTRACT_ADDRESS env var not set");

  const msId = process.env.MS_ID;
  if (!msId) throw new Error("MS_ID env var not set (e.g. MS_ID=9)");

  const reviewersRaw = process.env.REVIEWERS;
  if (!reviewersRaw) throw new Error("REVIEWERS env var not set (comma-separated addresses)");
  const reviewers = reviewersRaw.split(",").map((a) => a.trim());
  if (reviewers.length % 2 === 0) throw new Error("REVIEWERS count must be odd (≥ 3)");

  const PublicationRegistry = await hre.ethers.getContractAt("PublicationRegistry", registryAddress);
  const ORACLE_ROLE = await PublicationRegistry.ORACLE_ROLE();

  // Temporarily grant ORACLE_ROLE to admin so we can call fulfillRandomReviewers directly
  const hadOracleRole = await PublicationRegistry.hasRole(ORACLE_ROLE, admin.address);
  if (!hadOracleRole) {
    console.log("Granting temporary ORACLE_ROLE to admin...");
    await (await PublicationRegistry.grantRole(ORACLE_ROLE, admin.address)).wait();
  }

  try {
    console.log(`Re-assigning reviewers for manuscript #${msId}:`, reviewers);
    await (await PublicationRegistry.fulfillRandomReviewers(BigInt(msId), reviewers)).wait();
    console.log("ReviewersAssigned event emitted. Indexer will update the DB shortly.");
  } finally {
    if (!hadOracleRole) {
      console.log("Revoking temporary ORACLE_ROLE from admin...");
      await (await PublicationRegistry.revokeRole(ORACLE_ROLE, admin.address)).wait();
      console.log("ORACLE_ROLE revoked.");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
