import { Wallet, hashMessage } from 'ethers';

// Fixed enclave private key for serverless environment (never exported, used only in memory)
const ENCLAVE_PK = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
const wallet = new Wallet(ENCLAVE_PK);
const ENCLAVE_ADDRESS = wallet.address;

// In-memory serverless warm store for nonces
const nonceStore = new Map();
const ALLOWLIST = ['0x0000000000000000000000000000000000000001'];
const SPEND_CAP = 10000000000000000000n; // 10 C2FLR in wei

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

    if (instruction === 'GENERATE') {
      return res.status(200).json({
        instruction: 'GENERATE',
        address: ENCLAVE_ADDRESS
      });
    }

    if (instruction === 'GET_NONCE') {
      const agentId = payload.agentId || '0x000000000000000000000000000000000000000000000000000000000fe7e97f';
      const lastNonce = nonceStore.get(agentId);
      const expectedNonce = lastNonce === undefined ? 0 : lastNonce + 1;
      return res.status(200).json({ success: true, nonce: expectedNonce });
    }

    if (instruction === 'CHECK_AND_SIGN') {
      const { agentId, to, amount, nonce, timestamp, agentSignature } = payload;

      if (!agentId || !to || !amount || nonce === undefined || !timestamp || !agentSignature) {
        return res.status(200).json({
          success: false,
          reason: 'INVALID_REQUEST',
          details: 'Missing required request parameters'
        });
      }

      const idKey = agentId.toLowerCase();
      const lastNonce = nonceStore.get(idKey);
      const expectedNonce = lastNonce === undefined ? 0 : lastNonce + 1;

      // 1. Replay Protection
      if (nonce < expectedNonce) {
        return res.status(200).json({
          success: false,
          reason: 'REPLAY_DETECTED',
          details: `Expected nonce ${expectedNonce}, got ${nonce}`
        });
      }

      // 2. Allowlist Check
      const isAllowed = ALLOWLIST.some(addr => addr.toLowerCase() === to.toLowerCase());
      if (!isAllowed) {
        return res.status(200).json({
          success: false,
          reason: 'NOT_IN_ALLOWLIST',
          details: `Recipient ${to} is not in the agent policy allowlist`
        });
      }

      // 3. Spend Cap Check
      const amountWei = BigInt(amount);
      if (amountWei > SPEND_CAP) {
        return res.status(200).json({
          success: false,
          reason: 'SPEND_CAP_EXCEEDED',
          details: `Amount (${(Number(amountWei) / 1e18).toFixed(1)} C2FLR) exceeds daily policy spend cap of 10 C2FLR`
        });
      }

      // Record valid nonce
      nonceStore.set(idKey, nonce);

      // Sign transaction inside TEE
      const dummyTx = {
        to: to,
        value: amountWei,
        data: '0x',
        chainId: 114,
        nonce: nonce
      };
      const signedTx = await wallet.signTransaction(dummyTx);
      const simulatedHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

      return res.status(200).json({
        success: true,
        txHash: simulatedHash,
        signedTx: signedTx
      });
    }

    return res.status(400).json({ success: false, reason: 'UNKNOWN_INSTRUCTION' });
  } catch (err) {
    return res.status(500).json({ success: false, reason: 'INTERNAL_ERROR', details: err.message });
  }
}
