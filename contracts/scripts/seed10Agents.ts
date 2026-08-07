import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Seeding 10 Agents on Coston2 using deployer address:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const registryAddress = process.env.POLICY_REGISTRY_ADDRESS || "0xdE9a752440d0ba74FDC66F647c4a8437CA8C87De";
  const registry = await ethers.getContractAt("EnclivPolicyRegistry", registryAddress);

  const enclaveAddress = "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";

  const AGENTS = [
    {
      idStr: "custos-okx-7327",
      name: "Custos OKX Trading Agent #7327",
      spendCapEth: "10.0",
      allowlist: ["0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000002"],
      windowHours: 24,
      secondApproval: true,
      secondThresholdEth: "5.0",
      isUsd: false
    },
    {
      idStr: "eliza-social-agent",
      name: "Eliza OS Social Pay Agent",
      spendCapEth: "5.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 12,
      secondApproval: false,
      secondThresholdEth: "2.5",
      isUsd: false
    },
    {
      idStr: "autogpt-treasury-9",
      name: "AutoGPT Treasury Rebalancer",
      spendCapEth: "25.0",
      allowlist: ["0x0000000000000000000000000000000000000001", "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1"],
      windowHours: 48,
      secondApproval: true,
      secondThresholdEth: "10.0",
      isUsd: false
    },
    {
      idStr: "zerepy-arbitrage-bot",
      name: "ZerePy Cross-DEX Arbitrage Bot",
      spendCapEth: "15.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 24,
      secondApproval: false,
      secondThresholdEth: "5.0",
      isUsd: false
    },
    {
      idStr: "virtuals-game-npc",
      name: "Virtuals Protocol NPC Micro-Pay",
      spendCapEth: "2.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 6,
      secondApproval: false,
      secondThresholdEth: "1.0",
      isUsd: false
    },
    {
      idStr: "freysa-safeguard-agent",
      name: "Freysa Autonomous Safeguard",
      spendCapEth: "50.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 72,
      secondApproval: true,
      secondThresholdEth: "20.0",
      isUsd: false
    },
    {
      idStr: "morpheus-compute-buyer",
      name: "Morpheus AI Compute Node Buyer",
      spendCapEth: "8.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 24,
      secondApproval: false,
      secondThresholdEth: "4.0",
      isUsd: false
    },
    {
      idStr: "langchain-portfolio-mgr",
      name: "LangChain Portfolio Manager",
      spendCapEth: "12.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 24,
      secondApproval: true,
      secondThresholdEth: "6.0",
      isUsd: false
    },
    {
      idStr: "crewai-multiagent-fund",
      name: "CrewAI Hedge Fund Sentinel",
      spendCapEth: "30.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 48,
      secondApproval: true,
      secondThresholdEth: "15.0",
      isUsd: false
    },
    {
      idStr: "babyagi-automated-tester",
      name: "BabyAGI QA Execution Agent",
      spendCapEth: "3.0",
      allowlist: ["0x0000000000000000000000000000000000000001"],
      windowHours: 12,
      secondApproval: false,
      secondThresholdEth: "1.5",
      isUsd: false
    }
  ];

  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < AGENTS.length; i++) {
    const agent = AGENTS[i];
    const agentIdHex = ethers.id(agent.idStr);
    console.log(`\n[${i + 1}/10] Processing Agent: ${agent.name} (${agent.idStr})`);
    console.log(`  ID Hex: ${agentIdHex}`);

    let isReg = false;
    try {
      const record = await registry.getAgentPolicy(agentIdHex);
      isReg = record.isRegistered;
    } catch {
      isReg = false;
    }

    if (!isReg) {
      console.log(`  -> Registering agent on Coston2...`);
      const policy = {
        spendCap: ethers.parseEther(agent.spendCapEth),
        allowlist: agent.allowlist,
        timeWindowStart: now - 3600,
        timeWindowEnd: now + (agent.windowHours * 3600),
        requiresSecondApproval: agent.secondApproval,
        secondApprovalThreshold: ethers.parseEther(agent.secondThresholdEth),
        isUsdDenominated: agent.isUsd
      };

      const tx = await registry.registerAgent(agentIdHex, deployer.address, policy);
      console.log(`  -> Register Tx Sent: ${tx.hash}`);
      await tx.wait(1);
      console.log(`  -> Register Confirmed!`);
    } else {
      console.log(`  -> Agent already registered on-chain.`);
    }

    // Set Enclave Address
    try {
      console.log(`  -> Binding Enclave Address ${enclaveAddress}...`);
      const setTx = await registry.setEnclaveAddress(agentIdHex, enclaveAddress);
      console.log(`  -> Set Enclave Tx Sent: ${setTx.hash}`);
      await setTx.wait(1);
      console.log(`  -> Enclave Bound!`);
    } catch (e: any) {
      console.log(`  -> Enclave binding skipped or already set: ${e.message.split('\n')[0]}`);
    }
  }

  console.log("\n=======================================================");
  console.log("✅ ALL 10 AI AGENTS ARE REGISTERED ON COSTON2!");
  console.log("=======================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
