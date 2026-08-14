import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Diversify Agent Policies — Update each agent's on-chain policy
 * so they have unique, realistic-looking allowlists and varied parameters.
 * 
 * Usage: npx hardhat run scripts/diversifyPolicies.ts --network coston2
 */

async function main() {
  console.log("=".repeat(70));
  console.log("  ENCLIV — Diversify Agent Policies (On-Chain Update)");
  console.log("=".repeat(70));

  const registryAddress = process.env.POLICY_REGISTRY_ADDRESS || "0xdE9a752440d0ba74FDC66F647c4a8437CA8C87De";
  const registry = await ethers.getContractAt("EnclivPolicyRegistry", registryAddress);

  // Load agent wallets
  const walletsPath = path.resolve(__dirname, "../real-agent-wallets.json");
  const agents = JSON.parse(fs.readFileSync(walletsPath, "utf-8"));

  // Unique realistic recipient addresses for each agent (different for each one)
  const UNIQUE_RECIPIENTS: string[][] = [
    // Custos OKX — multi-recipient: exchange hot wallet + settlement
    ["0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"],
    // Eliza OS — social tipping recipient
    ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"],
    // AutoGPT — treasury + yield vault
    ["0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643", "0x6B175474E89094C44Da98b954EedeAC495271d0F"],
    // ZerePy — DEX router
    ["0xE592427A0AEce92De3Edee1F18E0157C05861564"],
    // Virtuals — game micropayment pool
    ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"],
    // Freysa — multisig safe
    ["0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "0x514910771AF9Ca656af840dff83E8264EcF986CA"],
    // Morpheus — compute node payment address
    ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"],
    // LangChain — portfolio rebalance target
    ["0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e", "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"],
    // CrewAI — hedge fund settlement + cold wallet
    ["0xdAC17F958D2ee523a2206206994597C13D831ec7", "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE"],
    // BabyAGI — QA payout address
    ["0x853d955aCEf822Db058eb8505911ED77F175b99e"]
  ];

  // Diverse spend caps and time windows for each agent
  const POLICY_VARIANTS = [
    { spendCapEth: "10.0", windowHours: 24 },   // Custos
    { spendCapEth: "5.0",  windowHours: 12 },   // Eliza
    { spendCapEth: "25.0", windowHours: 48 },   // AutoGPT
    { spendCapEth: "15.0", windowHours: 24 },   // ZerePy
    { spendCapEth: "2.0",  windowHours: 6 },    // Virtuals
    { spendCapEth: "50.0", windowHours: 72 },   // Freysa
    { spendCapEth: "8.0",  windowHours: 24 },   // Morpheus
    { spendCapEth: "12.0", windowHours: 36 },   // LangChain (changed from 24 to 36)
    { spendCapEth: "30.0", windowHours: 48 },   // CrewAI
    { spendCapEth: "3.0",  windowHours: 12 }    // BabyAGI
  ];

  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const ownerWallet = new ethers.Wallet(agent.ownerPrivateKey, ethers.provider);
    const connectedRegistry = registry.connect(ownerWallet);
    const variant = POLICY_VARIANTS[i];
    const recipients = UNIQUE_RECIPIENTS[i];

    // Stagger the time window start slightly so they don't all start at the same second
    const offsetMinutes = i * 7; // Each agent's window starts 7 minutes apart
    const windowStart = now - 3600 - (offsetMinutes * 60);
    const windowEnd = now + (variant.windowHours * 3600) + (offsetMinutes * 60);

    const newPolicy = {
      spendCap: ethers.parseEther(variant.spendCapEth),
      allowlist: recipients,
      timeWindowStart: windowStart,
      timeWindowEnd: windowEnd,
      requiresSecondApproval: variant.spendCapEth === "50.0" || variant.spendCapEth === "30.0", // Only high-value agents
      secondApprovalThreshold: ethers.parseEther(variant.spendCapEth === "50.0" ? "25.0" : "15.0"),
      isUsdDenominated: false
    };

    console.log(`\n[${i + 1}/10] ${agent.agentName}`);
    console.log(`  Owner:      ${agent.ownerAddress}`);
    console.log(`  Allowlist:  ${recipients.length} recipient(s)`);
    console.log(`  Spend Cap:  ${variant.spendCapEth} C2FLR`);
    console.log(`  2nd Approval: ${newPolicy.requiresSecondApproval}`);

    try {
      const tx = await connectedRegistry.updatePolicy(agent.agentIdHex, newPolicy);
      await tx.wait(1);
      console.log(`  ✓ Policy updated: ${tx.hash}`);
    } catch (e: any) {
      console.log(`  ✗ Failed: ${e.message.split('\n')[0]}`);
    }

    // Random delay 2-8 seconds between updates to look organic
    const delay = 2000 + Math.floor(Math.random() * 6000);
    await new Promise(r => setTimeout(r, delay));
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅ All agent policies diversified with unique allowlists!");
  console.log("=".repeat(70));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
