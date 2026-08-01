import { CheckAndSignRequest, PolicyCheckResult, SignedTransactionResult, RefusalResult } from '../utils/types.js';
import { keyManager } from '../crypto/keyManager.js';
import { fetchAgentRecord, getProvider, getContractAddress, getRecordSpendData } from '../utils/rpc.js';
import { evaluatePolicy } from '../policy/evaluator.js';
import { hashMessage, recoverAddress, TransactionRequest } from 'ethers';

/** Replay protection: tracks last accepted nonce per agentId (in-memory, resets on restart) */
const nonceStore = new Map<string, number>();

/** C2 Fix: Tracks pending (unconfirmed) spends to prevent TOCTOU race condition */
const pendingSpends = new Map<string, bigint>();

/** C2 Fix: Mutex to serialize requests per agent (prevents concurrent evaluation) */
const agentLocks = new Map<string, Promise<void>>();

async function withAgentLock<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing operation on this agent to complete
  const existing = agentLocks.get(agentId) ?? Promise.resolve();
  let resolve: () => void;
  const newLock = new Promise<void>(r => { resolve = r; });
  agentLocks.set(agentId, newLock);
  
  await existing;
  try {
    return await fn();
  } finally {
    resolve!();
    if (agentLocks.get(agentId) === newLock) {
      agentLocks.delete(agentId);
    }
  }
}

export function getAgentNonce(agentId: string): number {
  const last = nonceStore.get(agentId);
  return last === undefined ? 0 : last + 1;
}

export async function handleCheckAndSign(request: CheckAndSignRequest): Promise<SignedTransactionResult | RefusalResult> {
  console.log('[checkAndSign] Incoming request:', JSON.stringify(request));
  
  // H2 Fix: Validate all required fields before processing
  if (!request.agentId || !request.to || !request.amount ||
      request.nonce === undefined || request.nonce === null ||
      !request.timestamp || !request.agentSignature) {
    return { success: false, reason: 'INVALID_REQUEST', details: 'Missing required fields' };
  }

  // C2 Fix: Serialize requests per agent to prevent TOCTOU race
  return withAgentLock(request.agentId, async () => {
    try {
      // C3 Fix: Include enclave address in signed message to bind signature to this enclave instance
      const enclaveAddress = keyManager.getAddress();
      const message = `${request.agentId}:${request.to}:${request.amount}:${request.calldata}:${request.nonce}:${request.timestamp}:${enclaveAddress}`;

      // Caller authentication: recover signer and verify against on-chain agentOwner
      let recoveredAddress = '';
      try {
        recoveredAddress = recoverAddress(hashMessage(message), request.agentSignature);
      } catch {
        recoveredAddress = 'invalid';
      }

      let agentRecord = await fetchAgentRecord(request.agentId);

      // Fallback for simulated demo testing (e.g. demo-agent-1 in web console)
      const isSimulated = process.env.TEE_MODE !== '0';
      if (!agentRecord && isSimulated) {
        const now = Math.floor(Date.now() / 1000);
        agentRecord = {
          agentOwner: '0x0000000000000000000000000000000000000000',
          enclaveAddress: enclaveAddress,
          policy: {
            spendCap: 10000000000000000000n, // 10 C2FLR in wei
            allowlist: ['0x0000000000000000000000000000000000000001'],
            timeWindowStart: now - 3600,
            timeWindowEnd: now + 86400,
            requiresSecondApproval: false,
            secondApprovalThreshold: 5000000000000000000n,
            isUsdDenominated: false
          },
          currentWindowSpent: 0n,
          isRegistered: true
        };
        recoveredAddress = agentRecord.agentOwner; // Auto-pass caller auth in simulated console mode
      }

      if (!agentRecord) {
        return { success: false, reason: 'AGENT_NOT_REGISTERED' };
      }

      if (recoveredAddress.toLowerCase() !== agentRecord.agentOwner.toLowerCase()) {
        return { success: false, reason: 'INVALID_CALLER', details: 'Signer does not match agent owner' };
      }

      // Replay protection: verify nonce is >= expectedNonce (rejects any lower/reused nonce)
      const lastNonce = nonceStore.get(request.agentId);
      const expectedNonce = lastNonce === undefined ? 0 : lastNonce + 1;
      if (request.nonce < expectedNonce) {
        return { success: false, reason: 'REPLAY_DETECTED', details: `Expected nonce ${expectedNonce}, got ${request.nonce}` };
      }

      // C2 Fix: Add pending spends to on-chain amount for accurate cap check
      const pending = pendingSpends.get(request.agentId) ?? 0n;
      const adjustedRecord = {
        ...agentRecord,
        currentWindowSpent: agentRecord.currentWindowSpent + pending
      };

      // Policy evaluation with adjusted spend
      const checkResult = evaluatePolicy(request, adjustedRecord);
      if (!checkResult.allowed) {
        return { success: false, reason: checkResult.reason || 'UNKNOWN_POLICY_FAILURE' };
      }

      // Reserve the spend amount immediately (C2 fix)
      const requestAmount = BigInt(request.amount);
      pendingSpends.set(request.agentId, pending + requestAmount);

      // Update nonce after policy passes
      nonceStore.set(request.agentId, request.nonce);

      // Sign and broadcast
      const provider = getProvider();
      const enclaveBalance = await provider.getBalance(enclaveAddress);

      // Handle simulated console test mode when enclave address is unfunded
      if (process.env.TEE_MODE === '1' && (getContractAddress() === '0x0000000000000000000000000000000000000000' || enclaveBalance === 0n)) {
        const dummyTx: TransactionRequest = {
          to: request.to,
          value: request.amount,
          data: request.calldata,
          chainId: 114,
          nonce: request.nonce
        };
        const signedTx = await keyManager.signTransaction(dummyTx);
        const simulatedHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
        return {
          success: true,
          txHash: simulatedHash,
          signedTx: signedTx
        };
      }

      const evmNonce = await provider.getTransactionCount(enclaveAddress);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || BigInt(10000000000);

      // C1 Fix: First broadcast recordSpend and WAIT for confirmation
      const recordSpendData = getRecordSpendData(request.agentId, request.amount);
      const recordSpendTx: TransactionRequest = {
        to: getContractAddress(),
        data: recordSpendData,
        chainId: 114,
        nonce: evmNonce,
        gasLimit: 200000,
        gasPrice: gasPrice
      };

      const signedRecordSpendTx = await keyManager.signTransaction(recordSpendTx);
      const recordSpendResponse = await provider.broadcastTransaction(signedRecordSpendTx);

      // C1 Fix: Wait for confirmation — if this reverts, do NOT send the main tx
      const recordSpendReceipt = await recordSpendResponse.wait(1);
      if (!recordSpendReceipt || recordSpendReceipt.status !== 1) {
        // Release the pending spend since it failed
        pendingSpends.set(request.agentId, (pendingSpends.get(request.agentId) ?? 0n) - requestAmount);
        return { success: false, reason: 'SPEND_RECORD_FAILED', details: 'On-chain spend recording reverted' };
      }

      // Spend confirmed on-chain, release from pending tracker
      pendingSpends.set(request.agentId, (pendingSpends.get(request.agentId) ?? 0n) - requestAmount);

      // NOW send the main transaction
      const mainTx: TransactionRequest = {
        to: request.to,
        value: request.amount,
        data: request.calldata,
        chainId: 114,
        nonce: evmNonce + 1,
        gasLimit: 3000000,
        gasPrice: gasPrice
      };

      const signedMainTx = await keyManager.signTransaction(mainTx);
      const txResponse = await provider.broadcastTransaction(signedMainTx);

      return {
        success: true,
        txHash: txResponse.hash,
        signedTx: signedMainTx
      };
    } catch (error: any) {
      return { success: false, reason: 'INTERNAL_ERROR', details: error.message };
    }
  });
}
