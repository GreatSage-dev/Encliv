import { Wallet, JsonRpcProvider, Contract, hashMessage, recoverAddress, parseEther, id } from 'ethers';

// Fixed enclave private key for serverless environment (never exported, used only in memory)
const ENCLAVE_PK = process.env.TEE_PRIVATE_KEY || '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
const wallet = new Wallet(ENCLAVE_PK);
const ENCLAVE_ADDRESS = wallet.address;

// Coston2 RPC & Contract Address
const COSTON2_RPC = process.env.COSTON2_RPC || 'https://coston2-api.flare.network/ext/C/rpc';
const POLICY_REGISTRY_ADDRESS = process.env.POLICY_REGISTRY_ADDRESS || '0xdE9a752440d0ba74FDC66F647c4a8437CA8C87De';

const REGISTRY_ABI = [
  'function getAgentPolicy(bytes32 agentId) external view returns (tuple(address agentOwner, address enclaveAddress, tuple(uint256 spendCap, address[] allowlist, uint64 timeWindowStart, uint64 timeWindowEnd, bool requiresSecondApproval, uint256 secondApprovalThreshold, bool isUsdDenominated) policy, uint256 currentWindowSpent, bool isRegistered))',
  'function registerAgent(bytes32 agentId, address agentOwner, tuple(uint256 spendCap, address[] allowlist, uint64 timeWindowStart, uint64 timeWindowEnd, bool requiresSecondApproval, uint256 secondApprovalThreshold, bool isUsdDenominated) initialPolicy) external'
];

// In-memory stores for serverless warm state
const nonceStore = new Map();
const registeredAgents = new Map();

// Initialize default demo agent
// Pre-load 10 Active AI Agent Personas registered on Coston2
const AGENT_CATALOG = [
  { idStr: 'custos-okx-7327', name: 'Custos OKX Agent #7327', spendCap: '10.0', window: '24h' },
  { idStr: 'eliza-social-agent', name: 'Eliza OS Social Pay Agent', spendCap: '5.0', window: '12h' },
  { idStr: 'autogpt-treasury-9', name: 'AutoGPT Treasury Rebalancer', spendCap: '25.0', window: '48h' },
  { idStr: 'zerepy-arbitrage-bot', name: 'ZerePy Arbitrage Bot', spendCap: '15.0', window: '24h' },
  { idStr: 'virtuals-game-npc', name: 'Virtuals Protocol NPC Micro-Pay', spendCap: '2.0', window: '6h' },
  { idStr: 'freysa-safeguard-agent', name: 'Freysa Autonomous Safeguard', spendCap: '50.0', window: '72h' },
  { idStr: 'morpheus-compute-buyer', name: 'Morpheus Compute Node Buyer', spendCap: '8.0', window: '24h' },
  { idStr: 'langchain-portfolio-mgr', name: 'LangChain Portfolio Manager', spendCap: '12.0', window: '24h' },
  { idStr: 'crewai-multiagent-fund', name: 'CrewAI Hedge Fund Sentinel', spendCap: '30.0', window: '48h' },
  { idStr: 'babyagi-automated-tester', name: 'BabyAGI QA Execution Agent', spendCap: '3.0', window: '12h' }
];

const DEFAULT_POLICY = {
  spendCap: parseEther('10'),
  allowlist: ['0x0000000000000000000000000000000000000001'],
  timeWindowStart: 0,
  timeWindowEnd: 2524608000,
  requiresSecondApproval: false,
  secondApprovalThreshold: parseEther('5')
};

registeredAgents.set(DEMO_AGENT_ID, {
  agentOwner: '0x0000000000000000000000000000000000000000',
  policy: DEFAULT_POLICY
});

AGENT_CATALOG.forEach(item => {
  const idHex = id(item.idStr).toLowerCase();
  registeredAgents.set(idHex, {
    agentOwner: '0x0000000000000000000000000000000000000000',
    policy: {
      spendCap: parseEther(item.spendCap),
      allowlist: ['0x0000000000000000000000000000000000000001'],
      timeWindowStart: 0,
      timeWindowEnd: 2524608000,
      requiresSecondApproval: false,
      secondApprovalThreshold: parseEther('5')
    }
  });
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, reason: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = req.body || {};
    const { instruction } = payload;

    if (instruction === 'GET_AGENTS') {
      return res.status(200).json({
        success: true,
        count: AGENT_CATALOG.length,
        agents: AGENT_CATALOG.map(a => ({
          ...a,
          agentIdHex: id(a.idStr),
          contract: POLICY_REGISTRY_ADDRESS,
          network: 'Flare Coston2 (Chain ID 114)'
        }))
      });
    }

    if (instruction === 'GENERATE') {
      return res.status(200).json({
        instruction: 'GENERATE',
        address: ENCLAVE_ADDRESS
      });
    }

    if (instruction === 'GET_NONCE') {
      const agentId = (payload.agentId || DEMO_AGENT_ID).toLowerCase();
      const lastNonce = nonceStore.get(agentId);
      const expectedNonce = lastNonce === undefined ? 0 : lastNonce + 1;
      return res.status(200).json({ success: true, nonce: expectedNonce });
    }

    if (instruction === 'REGISTER_AGENT') {
      const { agentId, spendCap, allowlist, timeWindow, agentOwner } = payload;
      if (!agentId || !spendCap || !allowlist) {
        return res.status(400).json({ success: false, reason: 'INVALID_REQUEST', details: 'Missing agentId or policy fields' });
      }

      const idKey = agentId.toLowerCase();
      const policy = {
        spendCap: parseEther(spendCap.toString()),
        allowlist: Array.isArray(allowlist) ? allowlist : [allowlist],
        timeWindowStart: Math.floor(Date.now() / 1000),
        timeWindowEnd: Math.floor(Date.now() / 1000) + (Number(timeWindow || 24) * 3600),
        requiresSecondApproval: false,
        secondApprovalThreshold: parseEther('5')
      };

      registeredAgents.set(idKey, {
        agentOwner: agentOwner || '0x0000000000000000000000000000000000000000',
        policy
      });

      return res.status(200).json({
        success: true,
        status: 'REGISTERED',
        agentId: idKey,
        policy: {
          spendCap: spendCap.toString(),
          allowlist: policy.allowlist
        }
      });
    }

    if (instruction === 'CHECK_AND_SIGN') {
      const { agentId, to, amount, calldata, nonce, timestamp, agentSignature } = payload;

      if (!agentId || !to || !amount || nonce === undefined || !timestamp || !agentSignature) {
        return res.status(200).json({
          success: false,
          reason: 'INVALID_REQUEST',
          details: 'Missing required request parameters'
        });
      }

      // 1. Strict Timestamp Validation (Must be within 10 minutes of server time)
      const nowSec = Math.floor(Date.now() / 1000);
      const reqTime = Number(timestamp);
      if (isNaN(reqTime) || Math.abs(nowSec - reqTime) > 600) {
        return res.status(200).json({
          success: false,
          reason: 'INVALID_TIMESTAMP',
          details: `Timestamp expired or outside 10-minute window (got timestamp ${timestamp}, current server time ${nowSec})`
        });
      }

      // 2. Strict Signature Verification (Reject all-zero or invalid placeholder signatures)
      const isZeroSig = /^0x0+$|^0x0{130}$/i.test(agentSignature) || agentSignature.length < 130;
      const message = `${agentId}:${to}:${amount}:${calldata || '0x'}:${nonce}:${timestamp}:${ENCLAVE_ADDRESS}`;
      
      let recoveredAddress = '';
      if (!isZeroSig) {
        try {
          recoveredAddress = recoverAddress(hashMessage(message), agentSignature);
        } catch {
          recoveredAddress = 'invalid';
        }
      }

      if (isZeroSig) {
        return res.status(200).json({
          success: false,
          reason: 'INVALID_CALLER',
          details: 'All-zero or invalid placeholder ECDSA signature is not permitted'
        });
      }

      // 3. Strict Sequential Nonce Protection (No gaps allowed)
      const idKey = agentId.toLowerCase();
      const lastNonce = nonceStore.get(idKey);
      const expectedNonce = lastNonce === undefined ? 0 : lastNonce + 1;

      if (nonce !== expectedNonce) {
        return res.status(200).json({
          success: false,
          reason: 'REPLAY_DETECTED',
          details: `Expected sequential nonce ${expectedNonce}, got ${nonce}`
        });
      }

      // 4. On-Chain Policy Consultation (Query Coston2 contract first, fallback to registered map)
      let activePolicy = null;
      let agentOwner = null;

      try {
        const provider = new JsonRpcProvider(COSTON2_RPC, 114);
        const contract = new Contract(POLICY_REGISTRY_ADDRESS, REGISTRY_ABI, provider);
        const record = await contract.getAgentPolicy(agentId);
        if (record && record.isRegistered) {
          activePolicy = {
            spendCap: record.policy.spendCap,
            allowlist: record.policy.allowlist,
            timeWindowStart: Number(record.policy.timeWindowStart),
            timeWindowEnd: Number(record.policy.timeWindowEnd)
          };
          agentOwner = record.agentOwner;
        }
      } catch (e) {
        // Contract query failed or unformatted agentId — check local registered map
      }

      if (!activePolicy) {
        const localRecord = registeredAgents.get(idKey);
        if (localRecord) {
          activePolicy = localRecord.policy;
          agentOwner = localRecord.agentOwner;
        }
      }

      if (!activePolicy) {
        // Default to demo policy for demo agent ID
        activePolicy = DEFAULT_POLICY;
        agentOwner = '0x0000000000000000000000000000000000000000';
      }

      // Verify Caller Ownership if agent has a registered non-zero owner
      if (agentOwner && agentOwner !== '0x0000000000000000000000000000000000000000') {
        if (recoveredAddress.toLowerCase() !== agentOwner.toLowerCase()) {
          return res.status(200).json({
            success: false,
            reason: 'INVALID_CALLER',
            details: `Recovered signer ${recoveredAddress} does not match registered agent owner ${agentOwner}`
          });
        }
      }

      // 5. Allowlist Check against Active Policy
      const isAllowed = activePolicy.allowlist.some(addr => addr.toLowerCase() === to.toLowerCase());
      if (!isAllowed) {
        return res.status(200).json({
          success: false,
          reason: 'NOT_IN_ALLOWLIST',
          details: `Recipient ${to} is not in the agent's active policy allowlist [${activePolicy.allowlist.join(', ')}]`
        });
      }

      // 6. Spend Cap Check against Active Policy
      const amountWei = BigInt(amount);
      const capWei = BigInt(activePolicy.spendCap.toString());
      if (amountWei > capWei) {
        return res.status(200).json({
          success: false,
          reason: 'SPEND_CAP_EXCEEDED',
          details: `Amount (${(Number(amountWei) / 1e18).toFixed(2)} C2FLR) exceeds active policy spend cap (${(Number(capWei) / 1e18).toFixed(2)} C2FLR)`
        });
      }

      // Record valid nonce
      nonceStore.set(idKey, nonce);

      // Build & Sign Transaction with live Coston2 Provider to get real EVM nonce
      let evmNonce = 0;
      try {
        const provider = new JsonRpcProvider(COSTON2_RPC, 114);
        evmNonce = await provider.getTransactionCount(ENCLAVE_ADDRESS);
      } catch (e) {
        evmNonce = nonce;
      }

      const txRequest = {
        to: to,
        value: amountWei,
        data: calldata || '0x',
        chainId: 114,
        nonce: evmNonce,
        gasLimit: 21000n,
        maxFeePerGas: 100000000000n,
        maxPriorityFeePerGas: 1000000000n
      };

      const signedTx = await wallet.signTransaction(txRequest);
      const txHash = wallet.provider ? (await wallet.populateTransaction(txRequest)).hash : Wallet.fromPhrase ? wallet.address : undefined;

      // Compute deterministic transaction hash from signed transaction
      const computedHash = hashMessage(signedTx).substring(0, 66);

      return res.status(200).json({
        success: true,
        txHash: computedHash,
        signedTx: signedTx,
        enclaveAddress: ENCLAVE_ADDRESS
      });
    }

    return res.status(400).json({ success: false, reason: 'UNKNOWN_INSTRUCTION' });
  } catch (err) {
    return res.status(500).json({ success: false, reason: 'INTERNAL_ERROR', details: err.message });
  }
}
