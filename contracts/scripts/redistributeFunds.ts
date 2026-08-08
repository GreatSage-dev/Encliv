/**
 * Encliv Wallet Fund Redistributor
 * 
 * Creates 3 intermediate "mixer" wallets, sends C2FLR from the deployer
 * to the mixers, then from the mixers to the 10 agent owner wallets.
 * This way the agent wallets are NOT all funded directly by one address.
 * 
 * Usage (run from contracts/ dir):
 *   npx hardhat run scripts/redistributeFunds.ts --network coston2
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(70));
  console.log("  ENCLIV — Wallet Fund Redistributor");
  console.log("=".repeat(70));
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Balance:  ${ethers.formatEther(balance)} C2FLR`);
  console.log("");

  // Load agent wallets
  const walletsPath = path.resolve(__dirname, "../real-agent-wallets.json");
  const agents = JSON.parse(fs.readFileSync(walletsPath, "utf-8"));

  // Create 3 intermediate mixer wallets
  const mixers = [
    ethers.Wallet.createRandom().connect(ethers.provider),
    ethers.Wallet.createRandom().connect(ethers.provider),
    ethers.Wallet.createRandom().connect(ethers.provider)
  ];

  console.log("Step 1: Fund 3 mixer wallets from deployer");
  console.log("-".repeat(70));

  const perMixer = ethers.parseEther("8.0"); // 8 C2FLR each
  for (let i = 0; i < mixers.length; i++) {
    console.log(`  Mixer ${i + 1}: ${mixers[i].address}`);
    const tx = await deployer.sendTransaction({
      to: mixers[i].address,
      value: perMixer
    });
    await tx.wait(1);
    console.log(`    Funded: ${tx.hash}`);
  }

  console.log("\nStep 2: Distribute from mixers to agent wallets");
  console.log("-".repeat(70));

  // Split 10 agents across 3 mixers: [0-3], [4-6], [7-9]
  const splits = [
    agents.slice(0, 4),  // mixer 0 funds agents 1-4
    agents.slice(4, 7),  // mixer 1 funds agents 5-7
    agents.slice(7, 10)  // mixer 2 funds agents 8-10
  ];

  for (let m = 0; m < mixers.length; m++) {
    const mixer = mixers[m];
    const batch = splits[m];
    console.log(`\n  Mixer ${m + 1} (${mixer.address}) → ${batch.length} agents:`);

    for (const agent of batch) {
      const topUp = ethers.parseEther("1.0");
      try {
        const tx = await mixer.sendTransaction({
          to: agent.ownerAddress,
          value: topUp
        });
        await tx.wait(1);
        console.log(`    ✓ ${agent.agentName.substring(0, 35).padEnd(35)} → ${agent.ownerAddress}  (${tx.hash.substring(0, 18)}...)`);
      } catch (e) {
        console.log(`    ✗ ${agent.agentName}: ${e.message.split('\n')[0]}`);
      }
    }
  }

  // Save mixer info (keep private, don't push to GitHub)
  const mixerInfo = mixers.map((m, i) => ({
    mixerIndex: i + 1,
    address: m.address,
    privateKey: m.privateKey
  }));
  const mixerPath = path.resolve(__dirname, "../mixer-wallets.json");
  fs.writeFileSync(mixerPath, JSON.stringify(mixerInfo, null, 2));

  console.log("\n" + "=".repeat(70));
  console.log("✅ Fund redistribution complete!");
  console.log(`   Mixer credentials saved to: ${mixerPath}`);
  console.log("   Add mixer-wallets.json to .gitignore!");
  console.log("=".repeat(70));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
