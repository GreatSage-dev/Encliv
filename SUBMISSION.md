### Project Name
Encliv

### One-Line Description
Policy-gated authorization layer that enforces on-chain spend caps, allowlists, and time windows inside a sealed TEE before any AI agent transaction is signed.

### Problem
AI agents holding private keys are vulnerable to prompt injection, dependency compromise, and logic bugs. A single exploit means the agent signs away everything — there are no spending limits, recipient controls, or time boundaries. Traditional multisig wallets don't work because agents need to operate autonomously.

### Solution
Encliv is an authorization layer built on Flare Confidential Compute (FCC). The wallet key is generated inside the TEE at boot — never imported, exported, or exposed. Every transaction request passes through a policy engine that reads on-chain rules (spend caps, allowlists, time windows) from EnclivPolicyRegistry.sol on Coston2. Approved requests are signed and broadcast. Violations produce structured refusals with reason codes.

### How It Uses Flare
- **Flare Confidential Compute (FCC)**: TEE extension following the fce-extension-scaffold pattern. In-enclave keygen, CHECK_AND_SIGN instruction with policy evaluation.
- **FTSO v2 Price Feed**: Spend caps are denominated in USD using Flare's native FTSO v2 oracle (FLR/USD feed ID `0x01464c52...`). Policy enforcement uses real-time price data — not hardcoded token amounts.
- **Coston2 Testnet**: EnclivPolicyRegistry.sol deployed on Coston2 with full event emission for on-chain audit trail.
- **Coston2 Indexer DB**: Connected to the official Flare Coston2 indexer database (credentials provided by Flare DevRel) for high-performance event querying and policy audit trail.

### Target User
AI agent operators (individuals and teams) who deploy autonomous agents that hold and spend crypto — DeFi bots, payment agents, treasury managers, service-fee payers.

### Key Features
1. In-enclave key generation (never exported)
2. On-chain policy storage (spend caps, allowlists, time windows)
3. ECDSA caller authentication (impersonation impossible)
4. Replay protection bound to enclave address
5. On-chain spend tracking (survives TEE restart)
6. USD-denominated spend caps via FTSO oracle
7. Multi-agent registry (fleet-scale deployment)
8. Interactive browser console for live testing

### Technical Stack
- Solidity 0.8.25 (EnclivPolicyRegistry.sol) — OpenZeppelin ReentrancyGuard
- TypeScript TEE Extension — Express server, ethers.js v6
- Hardhat + Coston2 deployment
- 18 unit tests passing
- Interactive HTML/CSS/JS dashboard console for real-time scenario testing

### Demo & Testing Guide
- **Contract on Explorer**: [0xdE9a752440d0ba74FDC66F647c4a8437CA8C87De (Verified on Coston2 Blockscout)](https://coston2-explorer.flare.network/address/0xdE9a752440d0ba74FDC66F647c4a8437CA8C87De#code)
- **Live Console**: `http://localhost:3000/console.html`

#### ⚡ 2-Minute Judge Testing Steps (No wallet or funds required):
1. **Open Console**: Go to `http://localhost:3000/console.html` (verify `TEE Online` badge).
2. **Call GENERATE**: On Overview, click **`Call GENERATE`** to boot the in-memory TEE key.
3. **Test Valid Request**: Click **`Test Transaction`** → Select **`Valid Request`** → Click **`Send to TEE`** → See Green **`APPROVED`** status.
4. **Test Spend Cap Violation**: Select **`Exceed Cap`** → Click **`Send to TEE`** → See Red **`REFUSED — SPEND_CAP_EXCEEDED`**.
5. **Test Allowlist Violation**: Select **`Bad Recipient`** → Click **`Send to TEE`** → See Red **`REFUSED — NOT_IN_ALLOWLIST`**.

### What Was Built During the Hackathon
Everything. Encliv is a new project built entirely during the Flare Summer Signal hackathon period. No prior code existed.

### Honest Limitations (Disclosed)
- TEE runs in simulated mode (MODE=1) — no real GCP Confidential Space stood up
- Key is lost on TEE restart (documented limitation of in-memory keygen)
- Policy reads from chain via RPC (not through TEE attestation verification)
- Governance cosigner 2-of-3 designed but not demo'd
- Custos integration is a standalone demo client, not live-wired

### Roadmap / Next Steps
1. Deploy to GCP Confidential Space with real hardware attestation
2. Integrate FDC (Flare Data Connector) for cross-chain policy verification
3. Add governance cosigner support (2-of-3 threshold signing)
4. Dashboard for policy management (currently via contract calls)
5. Mainnet deployment on Flare with production-grade key management

### Bounty
Confidential Compute Apps
