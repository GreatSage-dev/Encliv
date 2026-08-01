# Encliv — Policy-Gated Agent Authorization Layer

**Flare Summer Signal Hackathon — Confidential Compute Track**

> Today's AI agents can be manipulated into signing bad transactions. Encliv is an authorization layer that enforces on-chain policy inside a sealed TEE before any signature is ever created — a wallet key that only signs when the request passes policy, and never exists outside the enclave.

---

## The Problem

Autonomous AI agents (trading bots, payment agents, DeFi operators) hold private keys and execute transactions on behalf of users. But:

- **Prompt injection attacks** can trick LLMs into signing malicious transactions
- **Key exposure** in agent memory means a compromised agent loses everything
- **No policy enforcement** — agents either have full signing authority or none

The result: a single vulnerability can drain an agent's entire wallet instantly.

## The Solution

Encliv moves transaction signing inside a **Trusted Execution Environment (TEE)** on Flare Confidential Compute, governed by **on-chain policy**:

1. **The private key is generated inside the enclave** and never leaves — not even the agent knows it
2. **Every transaction request is checked against on-chain policy** before signing:
   - Spend caps per time window
   - Recipient allowlists
   - Time window restrictions
   - Second approval thresholds
3. **Caller authentication** — the TEE verifies the requester's identity via ECDSA signature before evaluating policy
4. **Replay protection** — incrementing nonces prevent captured requests from being resubmitted
5. **On-chain spend tracking** — spend counters are stored on-chain, not in TEE memory, so an enclave restart can't bypass caps

## Architecture

```
┌──────────────────┐     1. Signed Request      ┌─────────────────────────────┐
│   AI Agent       │ ──────────────────────────> │   Flare Confidential        │
│   (e.g. Custos)  │                             │   Compute TEE               │
│                  │     4. Signed Tx / Refusal  │                             │
│                  │ <────────────────────────── │  2. Verify caller identity  │
└──────────────────┘                             │  3. Read on-chain policy    │
                                                 │  4. Evaluate rules          │
                                                 │  5. Sign or refuse          │
                                                 └─────────────┬───────────────┘
                                                               │
                                                    6. Broadcast tx + recordSpend
                                                               │
                                                               ▼
                                          ┌────────────────────────────────────┐
                                          │     Coston2 (Flare Testnet)        │
                                          │                                    │
                                          │  EnclivPolicyRegistry.sol          │
                                          │  - Agent registration              │
                                          │  - On-chain policy storage         │
                                          │  - Spend tracking                  │
                                          │  - Event emission (audit trail)    │
                                          └────────────────────────────────────┘
```

## Project Structure

```
Encliv/
├── contracts/                    # Solidity + Hardhat
│   ├── contracts/
│   │   └── EnclivPolicyRegistry.sol
│   ├── scripts/deploy.ts
│   ├── test/EnclivPolicyRegistry.test.ts
│   └── hardhat.config.ts
├── tee-extension/                # Flare Compute Extension (TypeScript)
│   ├── src/
│   │   ├── index.ts              # POST /action entry point
│   │   ├── handlers/
│   │   │   ├── generate.ts       # GENERATE instruction
│   │   │   └── checkAndSign.ts   # CHECK_AND_SIGN instruction
│   │   ├── policy/evaluator.ts   # Policy evaluation logic
│   │   ├── crypto/keyManager.ts  # In-enclave key generation
│   │   └── utils/
│   │       ├── rpc.ts            # On-chain policy reader
│   │       └── types.ts          # Shared types
│   └── Dockerfile
├── demo/                         # Demo scripts
│   ├── demo-flow.ts              # End-to-end demo
│   └── custos-integration.ts     # Custos agent integration
├── website/                      # Landing page
└── README.md
```

## Quick Start

### Prerequisites
- Node.js >= 20
- Coston2 testnet C2FLR (from [faucet](https://faucet.flare.network/coston2))

### 1. Smart Contract
```bash
cd contracts
npm install
cp ../.env.example ../.env  # Fill in PRIVATE_KEY
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network coston2
```

### 2. TEE Extension
```bash
cd tee-extension
npm install
npm run build
# Set POLICY_REGISTRY_ADDRESS in .env after deploying the contract
npm start
```

### 3. Demo
```bash
cd demo
npm install
# Ensure TEE extension is running on localhost:3001
npm run demo
```

## Integration: Custos (OKX.AI Agent ID 7327)

Custos is the **first registered consumer** of Encliv — registered through the same `registerAgent` flow any agent would use. The `custos-integration.ts` script demonstrates the exact request/response pattern:

```bash
cd demo
npm run custos
```

**Note:** This is a standalone demo client showing the integration pattern. It is not live-wired into the running Custos agent.

## Disclosed Limitations

We believe in honest disclosure over hidden weaknesses:

### Simulated TEE Mode
This hackathon build runs in `MODE=1` (simulated TEE). No GCP Confidential Space VM was provisioned. In production, this would run on hardware-backed TEE with genuine attestation.

### Key Loss on Enclave Restart
The key is generated fresh inside the enclave and never exported (by design). If the enclave restarts, that wallet address and any funds are permanently unrecoverable. Production fix: sealed/deterministic key derivation tied to the enclave's measurement hash via KMS.

### Policy Reads via Plain RPC
The TEE reads on-chain policy over standard JSON-RPC. A compromised RPC node could serve stale policy. Production fix: read policy via Flare Data Connector (FDC) cryptographic proofs.

### Governance
`GOVERNANCE_THRESHOLD` is set to 2, but only one signer is configured for the hackathon. Second signer to be assigned post-hackathon.

### Cosigner (2-of-3) Multisig
Designed but not demo'd — running 3 instances on a single machine defeats the purpose of redundancy. Documented as a designed feature for production deployment.

## Roadmap (Designed to Extend To)

These are future capabilities — explicitly **not** in the hackathon build:
- Security-oracle-based contract flagging
- Contract-age checks via FDC
- Slippage/DEX-trade limits
- Cross-chain asset movement
- Full DAO/institutional custody features

## Tech Stack

- **Smart Contract**: Solidity 0.8.25, OpenZeppelin, Hardhat
- **TEE Extension**: TypeScript, Express, ethers.js v6
- **Network**: Flare Coston2 Testnet (Chain ID 114)
- **TEE Infrastructure**: Flare Confidential Compute (simulated for hackathon)

## License

MIT

---

*Built for the [Flare Summer Signal Hackathon](https://dorahacks.io) — Confidential Compute Track*
