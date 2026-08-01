import { ethers, run } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const EnclivPolicyRegistry = await ethers.getContractFactory("EnclivPolicyRegistry");
  const registry = await EnclivPolicyRegistry.deploy();

  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("EnclivPolicyRegistry deployed to:", address);

  console.log("Waiting for block confirmations...");
  
  // Wait for 5 blocks before verifying
  const tx = registry.deploymentTransaction();
  if (tx) {
    await tx.wait(5);
  }

  console.log("Verifying contract...");
  try {
    await run("verify:verify", {
      address: address,
      constructorArguments: [],
    });
    console.log("Contract verified!");
  } catch (error) {
    console.error("Verification failed:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
