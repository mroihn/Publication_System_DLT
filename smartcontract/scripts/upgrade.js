const { ethers, upgrades } = require("hardhat");

/**
 * Upgrade script for PublicationRegistry (UUPS).
 *
 * Usage:
 *   PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade.js --network amoy
 */
async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) {
    console.error("ERROR: Set PROXY_ADDRESS environment variable");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading PublicationRegistry with account:", deployer.address);
  console.log("Proxy address:", proxyAddress);

  const PublicationRegistryV2 = await ethers.getContractFactory(
    "PublicationRegistry"
  );

  console.log("\nUpgrading proxy...");
  const upgraded = await upgrades.upgradeProxy(
    proxyAddress,
    PublicationRegistryV2,
    { kind: "uups" }
  );
  await upgraded.waitForDeployment();

  console.log("✓ PublicationRegistry upgraded successfully");
  console.log("  Proxy address (unchanged):", await upgraded.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
