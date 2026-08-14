/**
 * Encliv Agent Simulator — Automated Multi-Agent Interaction Engine
 * 
 * Loads 10 independent agent wallets from real-agent-wallets.json and 
 * continuously sends real signed CHECK_AND_SIGN requests to the Encliv 
 * TEE API at randomized intervals. Each agent signs with its own private key.
 * 
 * Usage:
 *   node scripts/agentSimulator.js
 *   node scripts/agentSimulator.js --rounds 50
 *   node scripts/agentSimulator.js --api https://encliv.vercel.app/api/action
 */

const { Wallet, hashMessage, parseEther, formatEther } = require('ethers');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────────────
const API_URL = process.argv.find(a => a.startsWith('--api='))
  ? process.argv.find(a => a.startsWith('--api=')).split('=')[1]
  : 'https://encliv.vercel.app/api/action';

const MAX_ROUNDS = process.argv.find(a => a.startsWith('--rounds='))
  ? parseInt(process.argv.find(a => a.startsWith('--rounds=')).split('=')[1])
  : 100;

const ENCLAVE_ADDRESS = '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';
const ALLOWED_RECIPIENT = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

// ─── Load agent wallets ──────────────────────────────────────────────────
const walletsPath = path.resolve(__dirname, '../contracts/real-agent-wallets.json');
if (!fs.existsSync(walletsPath)) {
  console.error('❌ real-agent-wallets.json not found at:', walletsPath);
  process.exit(1);
}
const agentWallets = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));
console.log(`Loaded ${agentWallets.length} agent wallets from manifest.\n`);

// Track nonces per agent (start at 0, increment after each successful call)
const nonceTracker = {};
agentWallets.forEach(a => { nonceTracker[a.agentIdHex.toLowerCase()] = 0; });

// ─── Helpers ─────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function randomDelay() {
  // Random delay between 3 and 15 seconds to look organic
  return randomInt(3000, 15000);
}

function pickRandomAmount(spendCapEth) {
  // Pick a random amount between 0.01 and 80% of the spend cap
  const cap = parseFloat(spendCapEth);
  const maxAmount = cap * 0.8;
  const amount = (Math.random() * maxAmount) + 0.01;
  return amount.toFixed(4);
}

function pickScenario() {
  // 70% valid, 15% over cap, 15% bad recipient
  const roll = Math.random();
  if (roll < 0.70) return 'VALID';
  if (roll < 0.85) return 'OVER_CAP';
  return 'BAD_RECIPIENT';
}

async function callAPI(payload) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return resp.json();
}

// ─── Main interaction loop ───────────────────────────────────────────────
async function runAgentInteraction(agent, roundNum) {
  const wallet = new Wallet(agent.ownerPrivateKey);
  const agentId = agent.agentIdHex;
  const idKey = agentId.toLowerCase();
  const scenario = pickScenario();

  let to, amountEth, amountWei;

  if (scenario === 'VALID') {
    to = ALLOWED_RECIPIENT;
    amountEth = pickRandomAmount(agent.spendCapEth);
    amountWei = parseEther(amountEth).toString();
  } else if (scenario === 'OVER_CAP') {
    to = ALLOWED_RECIPIENT;
    amountEth = (parseFloat(agent.spendCapEth) * 2).toFixed(2);
    amountWei = parseEther(amountEth).toString();
  } else {
    // BAD_RECIPIENT — use a random non-allowlisted address
    to = '0x' + 'dead'.repeat(10);
    amountEth = '0.5';
    amountWei = parseEther(amountEth).toString();
  }

  const nonce = nonceTracker[idKey];
  const timestamp = Math.floor(Date.now() / 1000);

  // Build the exact message the API expects, then sign it
  const message = `${agentId}:${to}:${amountWei}:0x:${nonce}:${timestamp}:${ENCLAVE_ADDRESS}`;
  const signature = await wallet.signMessage(message);

  const payload = {
    instruction: 'CHECK_AND_SIGN',
    agentId: agentId,
    to: to,
    amount: amountWei,
    calldata: '0x',
    nonce: nonce,
    timestamp: timestamp,
    agentSignature: signature
  };

  try {
    const result = await callAPI(payload);
    const status = result.success ? '🟢 APPROVED' : `🔴 ${result.reason}`;
    const shortName = agent.agentName.substring(0, 30).padEnd(30);

    console.log(
      `[R${String(roundNum).padStart(3, '0')}] ${shortName} | ${scenario.padEnd(12)} | ${amountEth.padStart(8)} C2FLR | nonce=${nonce} | ${status}`
    );

    // Only increment nonce on successful (approved) responses
    if (result.success) {
      nonceTracker[idKey] = nonce + 1;
    }
    // Also increment on REPLAY_DETECTED so we can re-sync
    if (result.reason === 'REPLAY_DETECTED' && result.details) {
      const match = result.details.match(/Expected sequential nonce (\d+)/);
      if (match) {
        nonceTracker[idKey] = parseInt(match[1]);
      }
    }

    return result;
  } catch (err) {
    console.error(`[R${roundNum}] ${agent.agentName} ERROR: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('='.repeat(90));
  console.log('  ENCLIV AGENT SIMULATOR — Automated Multi-Agent Interaction Engine');
  console.log('='.repeat(90));
  console.log(`  API Endpoint: ${API_URL}`);
  console.log(`  Agents:       ${agentWallets.length}`);
  console.log(`  Max Rounds:   ${MAX_ROUNDS}`);
  console.log(`  Enclave:      ${ENCLAVE_ADDRESS}`);
  console.log('='.repeat(90));
  console.log('');

  // Step 1: Boot enclave (GENERATE)
  console.log('[INIT] Calling GENERATE to boot enclave key...');
  const genResult = await callAPI({ instruction: 'GENERATE' });
  console.log(`[INIT] Enclave Address: ${genResult.address}\n`);

  // Step 2: Sync nonces for all agents
  console.log('[INIT] Syncing nonces for all agents...');
  for (const agent of agentWallets) {
    const nonceResult = await callAPI({
      instruction: 'GET_NONCE',
      agentId: agent.agentIdHex
    });
    if (nonceResult.success) {
      nonceTracker[agent.agentIdHex.toLowerCase()] = nonceResult.nonce;
    }
  }
  console.log('[INIT] Nonce sync complete.\n');

  // Step 3: Run interaction rounds
  let round = 1;
  while (round <= MAX_ROUNDS) {
    // Pick a random agent for this round
    const agent = agentWallets[randomInt(0, agentWallets.length - 1)];

    await runAgentInteraction(agent, round);
    round++;

    // Random organic delay between requests
    const delay = randomDelay();
    await sleep(delay);
  }

  console.log('\n' + '='.repeat(90));
  console.log(`✅ SIMULATION COMPLETE — ${MAX_ROUNDS} rounds executed across ${agentWallets.length} agents.`);
  console.log('='.repeat(90));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
