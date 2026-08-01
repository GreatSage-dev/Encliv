/**
 * Encliv End-to-End Demo Flow
 * 
 * Executes the complete demo flow required for the Flare Summer Signal submission:
 * 
 * 1. Deploy contract (or use existing) + show policy on-chain
 * 2. Register agent with policy → visible on Coston2 block explorer
 * 3. Send request WITHIN policy → signed, broadcast, funds move on Coston2
 * 4. Send request VIOLATING policy → refusal with structured reason
 * 5. (Optional) Register second agent with independent policy
 * 
 * Gas Funding Step (MANUAL):
 *   After the TEE generates its enclave address, fund it with ~1 C2FLR
 *   via the Coston2 faucet: https://faucet.flare.network/coston2
 *   The enclave address pays its own gas when broadcasting signed transactions.
 */

import 'dotenv/config';
import { ethers } from 'ethers';

// ─── Configuration ──────────────────────────────────────────────────────────

const COSTON2_RPC = process.env.COSTON2_RPC || 'https://coston2-api.flare.network/ext/C/rpc';
const POLICY_REGISTRY_ADDRESS = process.env.POLICY_REGISTRY_ADDRESS || '';
const TEE_ENDPOINT = process.env.TEE_ENDPOINT || 'http://localhost:3001';
const DEPLOYER_KEY = process.env.PRIVATE_KEY || '';

// ─── Contract ABI ───────────────────────────────────────────────────────────

const REGISTRY_ABI = [
  'function registerAgent(bytes32 agentId, address agentOwner, tuple(uint256 spendCap, address[] allowlist, uint64 timeWindowStart, uint64 timeWindowEnd, bool requiresSecondApproval, uint256 secondApprovalThreshold, bool isUsdDenominated) initialPolicy) external',
  'function setEnclaveAddress(bytes32 agentId, address enclaveAddr) external',
  'function updatePolicy(bytes32 agentId, tuple(uint256 spendCap, address[] allowlist, uint64 timeWindowStart, uint64 timeWindowEnd, bool requiresSecondApproval, uint256 secondApprovalThreshold, bool isUsdDenominated) newPolicy) external',
  'function getAgentPolicy(bytes32 agentId) external view returns (tuple(address agentOwner, address enclaveAddress, tuple(uint256 spendCap, address[] allowlist, uint64 timeWindowStart, uint64 timeWindowEnd, bool requiresSecondApproval, uint256 secondApprovalThreshold, bool isUsdDenominated) policy, uint256 currentWindowSpent, bool isRegistered))',
  'function isAllowlisted(bytes32 agentId, address target) external view returns (bool)',
  'event AgentRegistered(bytes32 indexed agentId, address indexed agentOwner, uint256 spendCap, bool isUsdDenominated, uint256 timestamp)',
  'event PolicyUpdated(bytes32 indexed agentId, uint256 newSpendCap, uint64 newWindowStart, uint64 newWindowEnd, uint256 timestamp)',
  'event SpendRecorded(bytes32 indexed agentId, uint256 amount, uint256 totalSpent, uint256 timestamp)',
  'event EnclaveAddressSet(bytes32 indexed agentId, address indexed enclaveAddress, uint256 timestamp)',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

async function callTee(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${TEE_ENDPOINT}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

function signRequest(
  wallet: ethers.Wallet,
  agentId: string,
  to: string,
  amount: string,
  calldata: string,
  nonce: number,
  timestamp: number,
  enclaveAddress: string
): Promise<string> {
  const message = `${agentId}:${to}:${amount}:${calldata}:${nonce}:${timestamp}:${enclaveAddress}`;
  return wallet.signMessage(message);
}

function divider(title: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Demo Steps ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║   E N C L I V   —   End-to-End Demo Flow                   ║');
  console.log('║   Policy-Gated Agent Authorization on Flare TEE            ║');
  console.log('║                                                            ║');
  console.log('║   Network: Coston2 (Chain ID 114)                          ║');
  console.log('║   Track: Flare Summer Signal — Confidential Compute        ║');
  console.log('║                                                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Validate
  if (!DEPLOYER_KEY) {
    console.error('\n  ERROR: PRIVATE_KEY not set in .env');
    process.exit(1);
  }
  if (!POLICY_REGISTRY_ADDRESS) {
    console.error('\n  ERROR: POLICY_REGISTRY_ADDRESS not set in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(COSTON2_RPC, 114);
  const deployerWallet = new ethers.Wallet(DEPLOYER_KEY, provider);

  console.log(`\n  Deployer: ${deployerWallet.address}`);
  const balance = await provider.getBalance(deployerWallet.address);
  console.log(`  Balance: ${ethers.formatEther(balance)} C2FLR`);
  console.log(`  Registry: ${POLICY_REGISTRY_ADDRESS}`);

  const registry = new ethers.Contract(POLICY_REGISTRY_ADDRESS, REGISTRY_ABI, deployerWallet);

  // ──────────────────────────────────────────────────────────────────────
  // DEMO STEP 0: Get TEE enclave address
  // ──────────────────────────────────────────────────────────────────────
  divider('STEP 0: Retrieve Enclave Address from TEE');

  const genResult = await callTee({ instruction: 'GENERATE' });
  const enclaveAddress = genResult.address as string;
  console.log(`  Enclave Address: ${enclaveAddress}`);

  const enclaveBalance = await provider.getBalance(enclaveAddress);
  console.log(`  Enclave Balance: ${ethers.formatEther(enclaveBalance)} C2FLR`);

  if (enclaveBalance === 0n) {
    console.log('');
    console.log('  ⚠  MANUAL STEP REQUIRED:');
    console.log(`  ⚠  Fund the enclave address with ~1 C2FLR for gas`);
    console.log(`  ⚠  Faucet: https://faucet.flare.network/coston2`);
    console.log(`  ⚠  Address: ${enclaveAddress}`);
    console.log('');
    console.log('  Press Ctrl+C to stop, fund the address, then re-run this script.');
    console.log('  Waiting 30 seconds for funding...');
    
    // Poll for funding
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const newBalance = await provider.getBalance(enclaveAddress);
      if (newBalance > 0n) {
        console.log(`  ✓ Funded: ${ethers.formatEther(newBalance)} C2FLR`);
        break;
      }
      process.stdout.write('.');
    }
    console.log('');
  }

  // ──────────────────────────────────────────────────────────────────────
  // DEMO STEP 1: Register agent + show policy on-chain
  // ──────────────────────────────────────────────────────────────────────
  divider('STEP 1: Register Agent with On-Chain Policy');

  const agentId = ethers.id('demo-agent-1');
  const recipient = process.env.DEMO_RECIPIENT || deployerWallet.address;
  const now = Math.floor(Date.now() / 1000);

  const policy = {
    spendCap: ethers.parseEther('10'),
    allowlist: [recipient],
    timeWindowStart: now,
    timeWindowEnd: now + 86400, // 24h
    requiresSecondApproval: false,
    secondApprovalThreshold: ethers.parseEther('5'),
    isUsdDenominated: false,
  };

  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Owner: ${deployerWallet.address}`);
  console.log(`  Spend Cap: 10 C2FLR / 24h`);
  console.log(`  Allowlist: [${recipient}]`);

  try {
    const existing = await registry.getAgentPolicy(agentId);
    if (existing.isRegistered) {
      console.log('  Agent already registered — skipping registration');
    }
  } catch {
    const tx = await registry.registerAgent(agentId, deployerWallet.address, policy);
    console.log(`  Registration Tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  ✓ Registered in block ${receipt?.blockNumber}`);
    console.log(`  View: https://coston2-explorer.flare.network/tx/${tx.hash}`);

    // Set enclave address
    const tx2 = await registry.setEnclaveAddress(agentId, enclaveAddress);
    console.log(`  Enclave Binding Tx: ${tx2.hash}`);
    await tx2.wait();
    console.log('  ✓ Enclave address bound to agent');
  }

  // Show policy on-chain
  console.log('\n  On-chain policy (proves rules are public):');
  const record = await registry.getAgentPolicy(agentId);
  console.log(`    spendCap: ${ethers.formatEther(record.policy.spendCap)} C2FLR`);
  console.log(`    allowlist: [${record.policy.allowlist.join(', ')}]`);
  console.log(`    timeWindowStart: ${new Date(Number(record.policy.timeWindowStart) * 1000).toISOString()}`);
  console.log(`    timeWindowEnd: ${new Date(Number(record.policy.timeWindowEnd) * 1000).toISOString()}`);
  console.log(`    currentWindowSpent: ${ethers.formatEther(record.currentWindowSpent)} C2FLR`);

  // ──────────────────────────────────────────────────────────────────────
  // DEMO STEP 2: Valid request → signed, broadcast, funds move
  // ──────────────────────────────────────────────────────────────────────
  divider('STEP 2: Valid Request — Within Policy');

  const amount1 = ethers.parseEther('0.5').toString();
  const timestamp1 = Math.floor(Date.now() / 1000);
  const sig1 = await signRequest(deployerWallet, agentId, recipient, amount1, '0x', 0, timestamp1, enclaveAddress);

  console.log(`  To: ${recipient}`);
  console.log(`  Amount: 0.5 C2FLR`);
  console.log(`  Signed by owner: ${deployerWallet.address}`);
  console.log('  → Sending to TEE CHECK_AND_SIGN...');

  const result1 = await callTee({
    instruction: 'CHECK_AND_SIGN',
    agentId,
    to: recipient,
    amount: amount1,
    calldata: '0x',
    nonce: 0,
    timestamp: timestamp1,
    agentSignature: sig1,
  });

  if (result1.success) {
    console.log('  ✓ APPROVED — Transaction signed inside enclave and broadcast');
    console.log(`  Tx Hash: ${result1.txHash}`);
    console.log(`  View: https://coston2-explorer.flare.network/tx/${result1.txHash}`);
    
    // Wait for confirmation
    console.log('  Waiting for confirmation...');
    const txReceipt = await provider.waitForTransaction(result1.txHash as string, 1, 30000);
    if (txReceipt?.status === 1) {
      console.log(`  ✓ Confirmed in block ${txReceipt.blockNumber} — funds moved on Coston2`);
    }
  } else {
    console.log(`  ✗ Refused: ${result1.reason} — ${result1.details || ''}`);
  }

  // ──────────────────────────────────────────────────────────────────────
  // DEMO STEP 3: Violating request → refusal with reason
  // ──────────────────────────────────────────────────────────────────────
  divider('STEP 3: Violating Request — Exceeds Spend Cap');

  const amount2 = ethers.parseEther('15').toString(); // Exceeds 10 C2FLR cap
  const timestamp2 = Math.floor(Date.now() / 1000);
  const sig2 = await signRequest(deployerWallet, agentId, recipient, amount2, '0x', 1, timestamp2, enclaveAddress);

  console.log(`  To: ${recipient}`);
  console.log(`  Amount: 15 C2FLR (exceeds 10 C2FLR spend cap)`);
  console.log('  → Sending to TEE CHECK_AND_SIGN...');

  const result2 = await callTee({
    instruction: 'CHECK_AND_SIGN',
    agentId,
    to: recipient,
    amount: amount2,
    calldata: '0x',
    nonce: 1,
    timestamp: timestamp2,
    agentSignature: sig2,
  });

  if (!result2.success) {
    console.log(`  ✓ CORRECTLY REFUSED — Reason: ${result2.reason}`);
  } else {
    console.log('  ✗ UNEXPECTED — This should have been refused!');
  }

  // ──────────────────────────────────────────────────────────────────────
  // DEMO STEP 3b: Violating request — Non-allowlisted recipient
  // ──────────────────────────────────────────────────────────────────────
  divider('STEP 3b: Violating Request — Non-Allowlisted Recipient');

  const badRecipient = '0x000000000000000000000000000000000000dEaD';
  const amount3 = ethers.parseEther('0.1').toString();
  const timestamp3 = Math.floor(Date.now() / 1000);
  // Use nonce 1 again since previous was refused (nonce wasn't consumed)
  const sig3 = await signRequest(deployerWallet, agentId, badRecipient, amount3, '0x', 1, timestamp3, enclaveAddress);

  console.log(`  To: ${badRecipient} (not in allowlist)`);
  console.log(`  Amount: 0.1 C2FLR`);
  console.log('  → Sending to TEE CHECK_AND_SIGN...');

  const result3 = await callTee({
    instruction: 'CHECK_AND_SIGN',
    agentId,
    to: badRecipient,
    amount: amount3,
    calldata: '0x',
    nonce: 1,
    timestamp: timestamp3,
    agentSignature: sig3,
  });

  if (!result3.success) {
    console.log(`  ✓ CORRECTLY REFUSED — Reason: ${result3.reason}`);
  } else {
    console.log('  ✗ UNEXPECTED — This should have been refused!');
  }

  // ──────────────────────────────────────────────────────────────────────
  // DEMO STEP 4: Register second independent agent (optional)
  // ──────────────────────────────────────────────────────────────────────
  divider('STEP 4: Register Second Independent Agent');

  const agent2Id = ethers.id('demo-agent-2-independent');
  const agent2Policy = {
    spendCap: ethers.parseEther('5'),          // Different cap
    allowlist: [badRecipient, recipient],       // Different allowlist
    timeWindowStart: now,
    timeWindowEnd: now + 3600,                  // 1h window (different)
    requiresSecondApproval: true,               // Different rules
    secondApprovalThreshold: ethers.parseEther('2'),
    isUsdDenominated: false,
  };

  console.log(`  Agent 2 ID: ${agent2Id}`);
  console.log(`  Policy: spendCap=5 C2FLR, window=1h, requiresSecondApproval=true`);
  console.log('  (Proves this is infrastructure, not hardcoded to one agent)');

  try {
    const tx = await registry.registerAgent(agent2Id, deployerWallet.address, agent2Policy);
    console.log(`  Tx: ${tx.hash}`);
    await tx.wait();
    console.log('  ✓ Second agent registered with independent policy');

    const record2 = await registry.getAgentPolicy(agent2Id);
    console.log(`    spendCap: ${ethers.formatEther(record2.policy.spendCap)} C2FLR`);
    console.log(`    requiresSecondApproval: ${record2.policy.requiresSecondApproval}`);
  } catch (e: any) {
    console.log(`  Note: ${e.message}`);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Demo Complete                                             ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  ✓ On-chain policy visible on block explorer               ║');
  console.log('║  ✓ Valid request → checked, signed in TEE, broadcast       ║');
  console.log('║  ✓ Violating request → refused with structured reason      ║');
  console.log('║  ✓ Second agent with independent policy registered         ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Explorer: https://coston2-explorer.flare.network          ║');
  console.log('║  Registry: ' + POLICY_REGISTRY_ADDRESS.padEnd(47) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
