export interface CheckAndSignRequest {
  agentId: string;           // bytes32 hex
  to: string;                // recipient address
  amount: string;            // amount in wei (string to handle BigInt)
  calldata: string;          // hex-encoded calldata (0x for simple transfer)
  nonce: number;             // incrementing nonce for replay protection
  timestamp: number;         // unix timestamp
  agentSignature: string;    // ECDSA signature from agentOwner
}

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: 'SPEND_CAP_EXCEEDED' | 'NOT_IN_ALLOWLIST' | 'OUTSIDE_TIME_WINDOW' | 'REQUIRES_SECOND_APPROVAL' | 'INVALID_CALLER' | 'REPLAY_DETECTED' | 'AGENT_NOT_REGISTERED';
}

export interface SignedTransactionResult {
  success: true;
  txHash: string;
  signedTx: string;
}

export interface RefusalResult {
  success: false;
  reason: string;
  details?: string;
}

export interface AgentRecord {
  agentOwner: string;
  enclaveAddress: string;
  policy: Policy;
  currentWindowSpent: bigint;
  isRegistered: boolean;
}

export interface Policy {
  spendCap: bigint;
  allowlist: string[];
  timeWindowStart: number;
  timeWindowEnd: number;
  requiresSecondApproval: boolean;
  secondApprovalThreshold: bigint;
  isUsdDenominated: boolean;
}
