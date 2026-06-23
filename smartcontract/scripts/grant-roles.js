const hre = require("hardhat");

async function main() {
  const [admin] = await hre.ethers.getSigners();
  const operatorAddress = process.env.OPERATOR_ADDRESS || admin.address;

  console.log("Granting roles using admin:", admin.address);
  console.log("Operator address:", operatorAddress);

  const registryAddress = process.env.REGISTRY_CONTRACT_ADDRESS;
  if (!registryAddress) throw new Error("REGISTRY_CONTRACT_ADDRESS env var not set");
  const PublicationRegistry = await hre.ethers.getContractAt("PublicationRegistry", registryAddress);

  // Grant OPERATOR_ROLE to the backend relayer wallet
  const OPERATOR_ROLE = await PublicationRegistry.OPERATOR_ROLE();
  if (await PublicationRegistry.hasRole(OPERATOR_ROLE, operatorAddress)) {
    console.log(`${operatorAddress} already has OPERATOR_ROLE.`);
  } else {
    console.log(`Granting OPERATOR_ROLE to ${operatorAddress}...`);
    await (await PublicationRegistry.grantRole(OPERATOR_ROLE, operatorAddress)).wait();
    console.log("OPERATOR_ROLE granted.");
  }

  // Optionally revoke RESEARCHER_ROLE and REVIEWER_ROLE if they were previously granted
  const RESEARCHER_ROLE = await PublicationRegistry.RESEARCHER_ROLE();
  if (await PublicationRegistry.hasRole(RESEARCHER_ROLE, operatorAddress)) {
    console.log(`Revoking RESEARCHER_ROLE from ${operatorAddress}...`);
    await (await PublicationRegistry.revokeRole(RESEARCHER_ROLE, operatorAddress)).wait();
    console.log("RESEARCHER_ROLE revoked.");
  }

  const REVIEWER_ROLE = await PublicationRegistry.REVIEWER_ROLE();
  if (await PublicationRegistry.hasRole(REVIEWER_ROLE, operatorAddress)) {
    console.log(`Revoking REVIEWER_ROLE from ${operatorAddress}...`);
    await (await PublicationRegistry.revokeRole(REVIEWER_ROLE, operatorAddress)).wait();
    console.log("REVIEWER_ROLE revoked.");
  }

  console.log("Done. Operator wallet is now configured as the meta-tx relayer.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
