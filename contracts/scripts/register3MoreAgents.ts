import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Register 3 Additional Independent AI Agents
 * Each with unique wallets, diverse policies, and different allowlists.
 * 
 * Usage: npx hardhat run scripts/register3MoreAgents.ts --network coston2
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("  ENCLIV — Register 3 Additional AI Agents");
  console.log("=".repeat(70));
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "C2FLR\n");

  const registryAddress = process.env.POLICY_REGISTRY_ADDRESS || "0xdE9a752440d0ba74FDC66F647c4a8437CA8C87De";
  const registry = await ethers.getContractAt("EnclivPolicyRegistry", registryAddress);
  const enclaveAddress = "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";

  const NEW_AGENTS = [
    {
      idStr: "fetch-ai-logistics-router",
      name: "Fetch.ai Logistics Router Agent",
      spendCapEth: "7.5",
      allowlist: [
        "0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413",
        "0x4Fabb145d64652a948d72533023f6E7A623C7C53"
      ],
      windowHours: 18,
      requiresSecondApproval: false,
      secondApprovalThreshold: "5.0"
    },
    {
      idStr: "ocean-protocol-data-buyer",
      name: "Ocean Protocol Data Marketplace Buyer",
      spendCapEth: "20.0",
      allowlist: [
        "0x967da4048cD07aB37855c090aAF366e4ce1b9F48",
        "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
        "0x0D8775F648430679A709E98d2b0Cb6250d2887EF"
      ],
      windowHours: 36,
      requiresSecondApproval: true,
      secondApprovalThreshold: "10.0"
    },
    {
      idStr: "superfluid-streaming-agent",
      name: "Superfluid Continuous Payment Stream",
      spendCapEth: "4.0",
      allowlist: [
        "0xbe9895146f7AF43049ca1c1AE358B0541Ea49704"
      ],
      windowHours: 8,
      requiresSecondApproval: false,
      secondApprovalThreshold: "3.0"
    }
  ];

  const now = Math.floor(Date.now() / 1000);
  const newWallets: any[] = [];

  for (let i = 0; i < NEW_AGENTS.length; i++) {
    const spec = NEW_AGENTS[i];
    const agentIdHex = ethers.id(spec.idStr);
    const agentWallet = ethers.Wallet.createRandom().connect(ethers.provider);

    console.log(`\n${"─".repeat(70)}`);
    console.log(`Agent [${i + 1}/3]: ${spec.name}`);
    console.log(`  Agent ID:  ${agentIdHex}`);
    console.log(`  Owner:     ${agentWallet.address}`);

    // Fund with varied amounts (not all the same)
    const fundAmounts = ["1.2", "1.8", "1.4"];
    const fundAmount = fundAmounts[i];
    console.log(`  Funding with ${fundAmount} C2FLR...`);
    const fundTx = await deployer.sendTransaction({
      to: agentWallet.address,
      value: ethers.parseEther(fundAmount)
    });
    await fundTx.wait(1);
    console.log(`  ✓ Funded: ${fundTx.hash}`);

    // Stagger time windows
    const offsetMin = (i + 11) * 5; // offset from the original 10
    const windowStart = now - 3600 - (offsetMin * 60);
    const windowEnd = now + (spec.windowHours * 3600) + (offsetMin * 60);

    const policy = {
      spendCap: ethers.parseEther(spec.spendCapEth),
      allowlist: spec.allowlist,
      timeWindowStart: windowStart,
      timeWindowEnd: windowEnd,
      requiresSecondApproval: spec.requiresSecondApproval,
      secondApprovalThreshold: ethers.parseEther(spec.secondApprovalThreshold),
      isUsdDenominated: false
    };

    // Register
    const agentContract = registry.connect(agentWallet);
    console.log(`  Registering agent...`);
    const regTx = await agentContract.registerAgent(agentIdHex, agentWallet.address, policy);
    await regTx.wait(1);
    console.log(`  ✓ Registered: ${regTx.hash}`);

    // Set enclave
    console.log(`  Setting enclave address...`);
    const setTx = await agentContract.setEnclaveAddress(agentIdHex, enclaveAddress);
    await setTx.wait(1);
    console.log(`  ✓ Enclave set: ${setTx.hash}`);

    newWallets.push({
      agentName: spec.name,
      agentIdStr: spec.idStr,
      agentIdHex: agentIdHex,
      ownerAddress: agentWallet.address,
      ownerPrivateKey: agentWallet.privateKey,
      spendCapEth: spec.spendCapEth,
      registrationTxHash: regTx.hash,
      enclaveSetTxHash: setTx.hash
    });

    // Random delay 3-10 seconds between agents
    if (i < NEW_AGENTS.length - 1) {
      const delay = 3000 + Math.floor(Math.random() * 7000);
      console.log(`  Waiting ${(delay / 1000).toFixed(1)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Append to existing wallets file
  const existingPath = path.resolve(__dirname, "../real-agent-wallets.json");
  const existing = JSON.parse(fs.readFileSync(existingPath, "utf-8"));
  const combined = [...existing, ...newWallets];
  fs.writeFileSync(existingPath, JSON.stringify(combined, null, 2));

  console.log(`\n${"=".repeat(70)}`);
  console.log(`✅ 3 new agents registered! Total: ${combined.length} agents on-chain.`);
  console.log(`   Wallet manifest updated: ${existingPath}`);
  console.log("=".repeat(70));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
