/**
 * Custos Integration Client for Encliv
 * 
 * Demonstrates how Custos (OKX.AI Agent ID 7327) would call the Encliv TEE
 * extension's CHECK_AND_SIGN instruction for a payment flow.
 * 
 * NOTE: This is a standalone demo client showing the integration pattern.
 * It is NOT live-wired into the actual running Custos agent infrastructure.
 * It demonstrates the exact request/response flow that Custos would use.
 */

import 'dotenv/config';
import { ethers } from 'ethers';

// ─── Configuration ──────────────────────────────────────────────────────────

const TEE_ENDPOINT = process.env.TEE_ENDPOINT || 'http://localhost:3001';
const COSTON2_RPC = process.env.COSTON2_RPC || 'https://coston2-api.flare.network/ext/C/rpc';
const POLICY_REGISTRY_ADDRESS = process.env.POLICY_REGISTRY_ADDRESS || '';

// Custos agent identity
const CUSTOS_AGENT_ID = ethers.id('custos-okx-7327'); // bytes32 hash
const CUSTOS_OWNER_PRIVATE_KEY = process.env.CUSTOS_OWNER_KEY || '';

// ─── Contract ABI (minimal for registration + policy reads) ─────────────────

const REGISTRY_ABI = [
  'function registerAgent(bytes32 agentId, address agentOwner, tuple(uint256 spendCap, address[] allowlist, uint64 timeWindowStart, uint64 timeWindowEnd, bool requiresSecondApproval, uint256 secondApprovalThreshold, bool isUsdDenominated) initialPolicy) external',
  'function setEnclaveAddress(bytes32 agentId, address enclaveAddr) external',
  'function getAgentPolicy(bytes32 agentId) external view returns (tuple(address agentOwner, address enclaveAddress, tuple(uint256 spendCap, address[] allowlist, uint64 timeWindowStart, uint64 timeWindowEnd, bool requiresSecondApproval, uint256 secondApprovalThreshold, bool isUsdDenominated) policy, uint256 currentWindowSpent, bool isRegistered))',
];

// ─── Helper: Sign a CHECK_AND_SIGN request as Custos ────────────────────────

function signCheckAndSignRequest(
  ownerWallet: ethers.Wallet,
  agentId: string,
  to: string,
  amount: string,
  calldata: string,
  nonce: number,
  timestamp: number,
  enclaveAddress: string
): Promise<string> {
  const message = `${agentId}:${to}:${amount}:${calldata}:${nonce}:${timestamp}:${enclaveAddress}`;
  return ownerWallet.signMessage(message);
}

// ─── Helper: Call TEE extension ─────────────────────────────────────────────

async function callTeeExtension(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${TEE_ENDPOINT}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json() as Promise<Record<string, unknown>>;
}

// ─── Step 1: Register Custos as an agent ────────────────────────────────────

async function registerCustosAgent(
  ownerWallet: ethers.Wallet,
  recipient: string,
  enclaveAddress: string
): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  STEP 1: Register Custos Agent on EnclivPolicyRegistry');
  console.log('═══════════════════════════════════════════════════');

  const provider = new ethers.JsonRpcProvider(COSTON2_RPC, 114);
  const signer = ownerWallet.connect(provider);
  const registry = new ethers.Contract(POLICY_REGISTRY_ADDRESS, REGISTRY_ABI, signer);

  // Check if already registered
  try {
    const existing = await registry.getAgentPolicy(CUSTOS_AGENT_ID);
    if (existing.isRegistered) {
      console.log('✓ Custos agent already registered');
      console.log(`  Agent Owner: ${existing.agentOwner}`);
      console.log(`  Enclave Address: ${existing.enclaveAddress}`);
      console.log(`  Spend Cap: ${ethers.formatEther(existing.policy.spendCap)} C2FLR`);
      return;
    }
  } catch {
    // Not registered yet — proceed
  }

  const now = Math.floor(Date.now() / 1000);
  const policy = {
    spendCap: ethers.parseEther('10'),       // 10 C2FLR per window
    allowlist: [recipient],                   // Only approved recipient
    timeWindowStart: now,
    timeWindowEnd: now + 86400,               // 24-hour window
    requiresSecondApproval: false,
    secondApprovalThreshold: ethers.parseEther('5'),
  };

  console.log(`  Agent ID: ${CUSTOS_AGENT_ID}`);
  console.log(`  Owner: ${ownerWallet.address}`);
  console.log(`  Policy: spendCap=10 C2FLR, window=24h, allowlist=[${recipient}]`);

  const tx = await registry.registerAgent(CUSTOS_AGENT_ID, ownerWallet.address, policy);
  console.log(`  Tx submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  ✓ Registered in block ${receipt?.blockNumber}`);

  // Set enclave address
  console.log(`  Setting enclave address: ${enclaveAddress}`);
  const tx2 = await registry.setEnclaveAddress(CUSTOS_AGENT_ID, enclaveAddress);
  await tx2.wait();
  console.log('  ✓ Enclave address set');
}

// ─── Step 2: Custos sends a valid payment request ───────────────────────────

async function sendValidPaymentRequest(
  ownerWallet: ethers.Wallet,
  recipient: string,
  nonce: number,
  enclaveAddress: string
): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  STEP 2: Custos Sends VALID Payment Request');
  console.log('═══════════════════════════════════════════════════');

  const amount = ethers.parseEther('1').toString(); // 1 C2FLR
  const calldata = '0x'; // Simple transfer
  const timestamp = Math.floor(Date.now() / 1000);

  console.log(`  To: ${recipient}`);
  console.log(`  Amount: 1 C2FLR`);
  console.log(`  Nonce: ${nonce}`);

  // Sign the request as Custos owner
  const agentSignature = await signCheckAndSignRequest(
    ownerWallet, CUSTOS_AGENT_ID, recipient, amount, calldata, nonce, timestamp, enclaveAddress
  );
  console.log(`  Agent Signature: ${agentSignature.slice(0, 20)}...`);

  // Call TEE extension
  console.log('  → Sending to TEE CHECK_AND_SIGN...');
  const result = await callTeeExtension({
    instruction: 'CHECK_AND_SIGN',
    agentId: CUSTOS_AGENT_ID,
    to: recipient,
    amount,
    calldata,
    nonce,
    timestamp,
    agentSignature,
  });

  if (result.success) {
    console.log('  ✓ APPROVED — Transaction signed and broadcast');
    console.log(`  Tx Hash: ${result.txHash}`);
    console.log(`  View: https://coston2-explorer.flare.network/tx/${result.txHash}`);
  } else {
    console.log(`  ✗ REFUSED — ${result.reason}`);
    if (result.details) console.log(`  Details: ${result.details}`);
  }

  return;
}

// ─── Step 3: Custos sends a request that violates policy ────────────────────

async function sendViolatingRequest(
  ownerWallet: ethers.Wallet,
  recipient: string,
  nonce: number,
  enclaveAddress: string
): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  STEP 3: Custos Sends VIOLATING Payment Request');
  console.log('═══════════════════════════════════════════════════');

  const amount = ethers.parseEther('15').toString(); // 15 C2FLR — exceeds 10 C2FLR cap
  const calldata = '0x';
  const timestamp = Math.floor(Date.now() / 1000);

  console.log(`  To: ${recipient}`);
  console.log(`  Amount: 15 C2FLR (exceeds 10 C2FLR spend cap)`);
  console.log(`  Nonce: ${nonce}`);

  const agentSignature = await signCheckAndSignRequest(
    ownerWallet, CUSTOS_AGENT_ID, recipient, amount, calldata, nonce, timestamp, enclaveAddress
  );

  console.log('  → Sending to TEE CHECK_AND_SIGN...');
  const result = await callTeeExtension({
    instruction: 'CHECK_AND_SIGN',
    agentId: CUSTOS_AGENT_ID,
    to: recipient,
    amount,
    calldata,
    nonce,
    timestamp,
    agentSignature,
  });

  if (result.success) {
    console.log('  ✗ UNEXPECTED — This should have been refused!');
  } else {
    console.log(`  ✓ CORRECTLY REFUSED — ${result.reason}`);
    if (result.details) console.log(`  Details: ${result.details}`);
  }
}

// ─── Step 4: Send to non-allowlisted address ────────────────────────────────

async function sendToUnauthorizedRecipient(
  ownerWallet: ethers.Wallet,
  nonce: number,
  enclaveAddress: string
): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  STEP 4: Custos Sends to NON-ALLOWLISTED Address');
  console.log('═══════════════════════════════════════════════════');

  const unauthorizedAddress = '0x000000000000000000000000000000000000dEaD';
  const amount = ethers.parseEther('1').toString();
  const calldata = '0x';
  const timestamp = Math.floor(Date.now() / 1000);

  console.log(`  To: ${unauthorizedAddress} (not in allowlist)`);
  console.log(`  Amount: 1 C2FLR`);

  const agentSignature = await signCheckAndSignRequest(
    ownerWallet, CUSTOS_AGENT_ID, unauthorizedAddress, amount, calldata, nonce, timestamp, enclaveAddress
  );

  console.log('  → Sending to TEE CHECK_AND_SIGN...');
  const result = await callTeeExtension({
    instruction: 'CHECK_AND_SIGN',
    agentId: CUSTOS_AGENT_ID,
    to: unauthorizedAddress,
    amount,
    calldata,
    nonce,
    timestamp,
    agentSignature,
  });

  if (result.success) {
    console.log('  ✗ UNEXPECTED — This should have been refused!');
  } else {
    console.log(`  ✓ CORRECTLY REFUSED — ${result.reason}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Encliv × Custos Integration Demo                       ║');
  console.log('║  Agent: Custos (OKX.AI Agent ID 7327)                   ║');
  console.log('║  Network: Coston2 (Chain ID 114)                        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  // Validate configuration
  if (!CUSTOS_OWNER_PRIVATE_KEY) {
    console.error('ERROR: CUSTOS_OWNER_KEY not set in .env');
    process.exit(1);
  }
  if (!POLICY_REGISTRY_ADDRESS) {
    console.error('ERROR: POLICY_REGISTRY_ADDRESS not set in .env');
    process.exit(1);
  }

  const ownerWallet = new ethers.Wallet(CUSTOS_OWNER_PRIVATE_KEY);
  const recipient = process.env.DEMO_RECIPIENT || '0x0000000000000000000000000000000000000001';

  console.log(`\nCustos Owner Address: ${ownerWallet.address}`);
  console.log(`Recipient: ${recipient}`);
  console.log(`Policy Registry: ${POLICY_REGISTRY_ADDRESS}`);

  // Step 0: Get enclave address from TEE
  console.log('\n  Fetching enclave address from TEE...');
  const generateResult = await callTeeExtension({ instruction: 'GENERATE' });
  const enclaveAddress = generateResult.address as string;
  console.log(`  Enclave Address: ${enclaveAddress}`);
  console.log(`  ⚠ Fund this address with ~1 C2FLR for gas: https://faucet.flare.network/coston2`);

  // Step 1: Register Custos agent
  await registerCustosAgent(ownerWallet, recipient, enclaveAddress);

  // Step 2: Valid payment (within policy)
  await sendValidPaymentRequest(ownerWallet, recipient, 0, enclaveAddress);

  // Step 3: Violating payment (exceeds spend cap)
  await sendViolatingRequest(ownerWallet, recipient, 1, enclaveAddress);

  // Step 4: Non-allowlisted recipient
  await sendToUnauthorizedRecipient(ownerWallet, 2, enclaveAddress);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Demo Complete');
  console.log('═══════════════════════════════════════════════════');
  console.log('\nVerify transactions on Coston2 Explorer:');
  console.log('  https://coston2-explorer.flare.network');
}

main().catch(console.error);
