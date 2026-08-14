import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Registering Superfluid agent (fix checksum)...");

  const registryAddress = "0xdE9a752440d0ba74FDC66F647c4a8437CA8C87De";
  const registry = await ethers.getContractAt("EnclivPolicyRegistry", registryAddress);
  const enclaveAddress = "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";

  const spec = {
    idStr: "superfluid-streaming-agent",
    name: "Superfluid Continuous Payment Stream",
    spendCapEth: "4.0",
    // Fixed checksum address
    allowlist: [ethers.getAddress("0xbe9895146f7af43049ca1c1ae358b0541ea49704")],
    windowHours: 8
  };

  const agentIdHex = ethers.id(spec.idStr);

  // Generate new wallet
  const newWallet = ethers.Wallet.createRandom().connect(ethers.provider);
  console.log(`  Owner: ${newWallet.address}`);

  // Fund
  const fundTx = await deployer.sendTransaction({
    to: newWallet.address,
    value: ethers.parseEther("1.4")
  });
  await fundTx.wait(1);
  console.log(`  ✓ Funded: ${fundTx.hash}`);

  const now = Math.floor(Date.now() / 1000);
  const policy = {
    spendCap: ethers.parseEther(spec.spendCapEth),
    allowlist: spec.allowlist,
    timeWindowStart: now - 3600 - (13 * 5 * 60),
    timeWindowEnd: now + (spec.windowHours * 3600) + (13 * 5 * 60),
    requiresSecondApproval: false,
    secondApprovalThreshold: ethers.parseEther("3.0"),
    isUsdDenominated: false
  };

  const agentContract = registry.connect(newWallet);
  const regTx = await agentContract.registerAgent(agentIdHex, newWallet.address, policy);
  await regTx.wait(1);
  console.log(`  ✓ Registered: ${regTx.hash}`);

  const setTx = await agentContract.setEnclaveAddress(agentIdHex, enclaveAddress);
  await setTx.wait(1);
  console.log(`  ✓ Enclave set: ${setTx.hash}`);

  // Append to wallets file
  const walletsPath = path.resolve(__dirname, "../real-agent-wallets.json");
  const existing = JSON.parse(fs.readFileSync(walletsPath, "utf-8"));
  existing.push({
    agentName: spec.name,
    agentIdStr: spec.idStr,
    agentIdHex: agentIdHex,
    ownerAddress: newWallet.address,
    ownerPrivateKey: newWallet.privateKey,
    spendCapEth: spec.spendCapEth,
    registrationTxHash: regTx.hash,
    enclaveSetTxHash: setTx.hash
  });
  fs.writeFileSync(walletsPath, JSON.stringify(existing, null, 2));
  console.log(`\n✅ Superfluid agent registered! Total: ${existing.length} agents.`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
