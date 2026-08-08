import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("==========================================================================");
  console.log("Registering 10 REAL Independent AI Agents with 10 Separate Owner Wallets");
  console.log("==========================================================================");
  console.log("Deployer Address (Funder):", deployer.address);
  
  const balanceWei = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer Balance:", ethers.formatEther(balanceWei), "C2FLR\n");

  const registryAddress = process.env.POLICY_REGISTRY_ADDRESS || "0xdE9a752440d0ba74FDC66F647c4a8437CA8C87De";
  const registryContract = await ethers.getContractAt("EnclivPolicyRegistry", registryAddress);
  const enclaveAddress = "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";

  // 10 Distinct AI Agent Framework Personas
  const AGENT_SPECS = [
    {
      idStr: "custos-okx-agent-7327",
      name: "Custos OKX Trading Agent #7327",
      spendCapEth: "10.0",
      allowlist: ["0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000002"],
      windowHours: 24
    },
    {
      idStr: "eliza-social-pay-agent",
      name: "Eliza OS Social Pay Agent",
      spendCapEth: "5.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 12
    },
    {
      idStr: "autogpt-defi-treasury-v2",
      name: "AutoGPT DeFi Treasury Manager",
      spendCapEth: "25.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 48
    },
    {
      idStr: "zerepy-crossdex-arbitrage",
      name: "ZerePy Cross-DEX Arbitrage Bot",
      spendCapEth: "15.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 24
    },
    {
      idStr: "virtuals-game-npc-payer",
      name: "Virtuals Protocol Micro-Payer NPC",
      spendCapEth: "2.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 6
    },
    {
      idStr: "freysa-autonomous-safeguard",
      name: "Freysa Autonomous Safeguard",
      spendCapEth: "50.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 72
    },
    {
      idStr: "morpheus-ai-compute-buyer",
      name: "Morpheus AI Compute Buyer",
      spendCapEth: "8.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 24
    },
    {
      idStr: "langchain-rebalance-sentinel",
      name: "LangChain Portfolio Sentinel",
      spendCapEth: "12.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 24
    },
    {
      idStr: "crewai-hedgefund-manager",
      name: "CrewAI Hedge Fund Manager",
      spendCapEth: "30.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 48
    },
    {
      idStr: "babyagi-automated-qa-tester",
      name: "BabyAGI QA Execution Agent",
      spendCapEth: "3.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 12
    }
  ];

  const now = Math.floor(Date.now() / 1000);
  const savedWallets: any[] = [];

  for (let i = 0; i < AGENT_SPECS.length; i++) {
    const spec = AGENT_SPECS[i];
    const agentIdHex = ethers.id(spec.idStr);
    
    // Generate a BRAND NEW, UNIQUE Wallet for each agent owner
    const agentWallet = ethers.Wallet.createRandom().connect(ethers.provider);
    console.log(`--------------------------------------------------------------------------`);
    console.log(`Agent [${i + 1}/10]: ${spec.name}`);
    console.log(`Agent ID Hex: ${agentIdHex}`);
    console.log(`Unique Owner Address: ${agentWallet.address}`);
    console.log(`Private Key: ${agentWallet.privateKey}`);

    // Step 1: Fund the unique Agent Owner wallet with C2FLR gas from deployer
    console.log(`-> Funding owner wallet with 1.5 C2FLR...`);
    const fundTx = await deployer.sendTransaction({
      to: agentWallet.address,
      value: ethers.parseEther("1.5")
    });
    await fundTx.wait(1);
    console.log(`   Fund Tx Confirmed: ${fundTx.hash}`);

    // Connect contract using THIS agent's unique owner wallet
    const agentContract = registryContract.connect(agentWallet);

    // Step 2: Register agent from ITS OWN UNIQUE WALLET
    console.log(`-> Calling registerAgent() directly from ${agentWallet.address}...`);
    const policy = {
      spendCap: ethers.parseEther(spec.spendCapEth),
      allowlist: spec.allowlist,
      timeWindowStart: now - 3600,
      timeWindowEnd: now + (spec.windowHours * 3600),
      requiresSecondApproval: false,
      secondApprovalThreshold: ethers.parseEther("5.0"),
      isUsdDenominated: false
    };

    const regTx = await agentContract.registerAgent(agentIdHex, agentWallet.address, policy);
    await regTx.wait(1);
    console.log(`   Registration Tx Confirmed: ${regTx.hash}`);

    // Step 3: Bind Enclave Address from ITS OWN UNIQUE WALLET
    console.log(`-> Calling setEnclaveAddress() directly from ${agentWallet.address}...`);
    const setTx = await agentContract.setEnclaveAddress(agentIdHex, enclaveAddress);
    await setTx.wait(1);
    console.log(`   Enclave Set Tx Confirmed: ${setTx.hash}`);

    savedWallets.push({
      agentName: spec.name,
      agentIdStr: spec.idStr,
      agentIdHex: agentIdHex,
      ownerAddress: agentWallet.address,
      ownerPrivateKey: agentWallet.privateKey,
      spendCapEth: spec.spendCapEth,
      registrationTxHash: regTx.hash,
      enclaveSetTxHash: setTx.hash
    });
  }

  // Save the full 10-agent wallet manifest to file
  const outputPath = path.resolve(__dirname, "../real-agent-wallets.json");
  fs.writeFileSync(outputPath, JSON.stringify(savedWallets, null, 2));

  console.log("\n==========================================================================");
  console.log("🎉 SUCCESS! 10 DISTINCT AGENT OWNER WALLETS CREATED & REGISTERED ON-CHAIN!");
  console.log("==========================================================================");
  console.log(`Saved full credentials manifest to: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
