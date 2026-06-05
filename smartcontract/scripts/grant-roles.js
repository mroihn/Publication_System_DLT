const hre = require("hardhat");

async function main() {
  const [admin] = await hre.ethers.getSigners();
  const operatorAddress = admin.address;
  
  console.log("Granting roles using admin:", admin.address);

  const registryAddress = "";
  const PublicationRegistry = await hre.ethers.getContractAt("PublicationRegistry", registryAddress);

  const RESEARCHER_ROLE = await PublicationRegistry.RESEARCHER_ROLE();

  // Check if already has role
  const hasRole = await PublicationRegistry.hasRole(RESEARCHER_ROLE, operatorAddress);
  if (hasRole) {
    console.log(`Address ${operatorAddress} already has RESEARCHER_ROLE.`);
  } else {
    console.log(`Granting RESEARCHER_ROLE to ${operatorAddress}...`);
    const tx = await PublicationRegistry.addResearcher(operatorAddress);
    await tx.wait();
    console.log("Successfully granted RESEARCHER_ROLE.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
