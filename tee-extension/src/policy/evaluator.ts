import { CheckAndSignRequest, AgentRecord, PolicyCheckResult } from '../utils/types.js';

/** Maximum allowed clock drift between request timestamp and server time (seconds) */
const MAX_TIMESTAMP_DRIFT = 300; // 5 minutes

/**
 * Evaluates whether a transaction request passes the agent's policy.
 * This is a pure function with no side effects.
 *
 * @param request - The transaction request details
 * @param agentRecord - The on-chain policy record (may have adjusted currentWindowSpent for pending txs)
 * @returns PolicyCheckResult indicating if allowed, and if not, the reason
 */
export function evaluatePolicy(
  request: CheckAndSignRequest,
  agentRecord: AgentRecord
): PolicyCheckResult {
  // 1. Agent must be registered
  if (!agentRecord.isRegistered) {
    return { allowed: false, reason: 'AGENT_NOT_REGISTERED' };
  }

  const policy = agentRecord.policy;

  // 2. Validate request timestamp is within acceptable drift of server time
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - request.timestamp) > MAX_TIMESTAMP_DRIFT) {
    return { allowed: false, reason: 'OUTSIDE_TIME_WINDOW' };
  }

  // 3. Current time must be within policy time window
  if (now < policy.timeWindowStart || now > policy.timeWindowEnd) {
    return { allowed: false, reason: 'OUTSIDE_TIME_WINDOW' };
  }

  // 4. Recipient must be in allowlist (case-insensitive)
  const toLower = request.to.toLowerCase();
  const isAllowlisted = policy.allowlist.some(addr => addr.toLowerCase() === toLower);
  if (!isAllowlisted) {
    return { allowed: false, reason: 'NOT_IN_ALLOWLIST' };
  }

  // 5. Spend cap check (currentWindowSpent may include pending unconfirmed spends)
  const requestAmount = BigInt(request.amount);
  const totalSpent = agentRecord.currentWindowSpent + requestAmount;
  if (totalSpent > policy.spendCap) {
    return { allowed: false, reason: 'SPEND_CAP_EXCEEDED' };
  }

  // 6. Second approval threshold
  if (policy.requiresSecondApproval && requestAmount > policy.secondApprovalThreshold) {
    return { allowed: false, reason: 'REQUIRES_SECOND_APPROVAL' };
  }

  return { allowed: true };
}
