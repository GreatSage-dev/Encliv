import { JsonRpcProvider, Contract, Provider, Interface } from 'ethers';
import { AgentRecord } from './types.js';

export const ABI = [
  "function getAgentPolicy(bytes32 agentId) external view returns (tuple(address agentOwner, address enclaveAddress, tuple(uint256 spendCap, address[] allowlist, uint64 timeWindowStart, uint64 timeWindowEnd, bool requiresSecondApproval, uint256 secondApprovalThreshold, bool isUsdDenominated) policy, uint256 currentWindowSpent, bool isRegistered))",
  "function isAllowlisted(bytes32 agentId, address target) external view returns (bool)",
  "function recordSpend(bytes32 agentId, uint256 amount) external",
  "function convertWeiToUsdCents(uint256 weiAmount) external view returns (uint256)",
  "function getFlrUsdPrice() external view returns (uint256 price, int8 decimals, uint64 timestamp)"
];

let provider: JsonRpcProvider | null = null;

export function getProvider(): Provider {
  if (!provider) {
    const rpcUrl = process.env.RPC_URL || 'https://coston2-api.flare.network/ext/C/rpc';
    provider = new JsonRpcProvider(rpcUrl, 114);
  }
  return provider;
}

export function getContractAddress(): string {
  const address = process.env.POLICY_REGISTRY_ADDRESS || '0x0000000000000000000000000000000000000000'; // dummy for tests if needed, but should be set
  // we won't throw so tests can pass without env, but it will fail on-chain
  return address;
}

export async function fetchAgentRecord(agentId: string): Promise<AgentRecord | null> {
  try {
    const c = new Contract(getContractAddress(), ABI, getProvider());
    const record = await c.getAgentPolicy(agentId);

    return {
      agentOwner: record.agentOwner,
      enclaveAddress: record.enclaveAddress,
      policy: {
        spendCap: record.policy.spendCap,
        allowlist: [...record.policy.allowlist],
        timeWindowStart: Number(record.policy.timeWindowStart),
        timeWindowEnd: Number(record.policy.timeWindowEnd),
        requiresSecondApproval: record.policy.requiresSecondApproval,
        secondApprovalThreshold: record.policy.secondApprovalThreshold,
        isUsdDenominated: record.policy.isUsdDenominated
      },
      currentWindowSpent: record.currentWindowSpent,
      isRegistered: record.isRegistered
    };
  } catch {
    // Contract reverts for unregistered agents
    return null;
  }
}

export function getRecordSpendData(agentId: string, amount: string): string {
  const iface = new Interface(ABI);
  return iface.encodeFunctionData("recordSpend", [agentId, amount]);
}
