### Video Script — Encliv Demo (3 minutes)

**[0:00 - 0:30] The Problem**
- Show on screen: headline text "AI agents hold private keys. One prompt injection = everything gone."
- Voiceover: "AI agents that hold crypto private keys are a ticking time bomb. A prompt injection, a compromised dependency, or a simple logic bug — and the agent signs away all funds. There's no spending limit, no recipient check, no time boundary. Encliv fixes this."

**[0:30 - 1:00] How Encliv Works**
- Show: the architecture diagram from the website (Agent → TEE → Chain)
- Voiceover: "Encliv is an authorization layer on Flare Confidential Compute. The wallet key is generated inside a sealed TEE — it never leaves. Every transaction request passes through a policy engine that reads on-chain rules. If the request passes, it gets signed. If not, it's refused with a reason code."
- Show: the Coston2 explorer showing EnclivPolicyRegistry contract

**[1:00 - 2:00] Live Demo**
- Show: Open the Encliv Console in browser
- Action: Click "Call GENERATE" — show the enclave address appear
- Action: Click "Valid Request" preset → Send to TEE → show APPROVED result
- Action: Click "Exceed Cap" preset → Send to TEE → show REFUSED - SPEND_CAP_EXCEEDED
- Action: Click "Bad Recipient" preset → Send to TEE → show REFUSED - NOT_IN_ALLOWLIST
- Voiceover: "The TEE approved a valid 0.5 C2FLR transfer, but refused a 15 C2FLR transfer that exceeds the $50/day cap, and refused a transfer to an address not on the allowlist."

**[2:00 - 2:30] On-Chain Verification**
- Show: Coston2 Blockscout explorer
- Show: AgentRegistered event
- Show: SpendRecorded event
- Show: The policy struct in the contract read function
- Voiceover: "Every action is recorded on-chain. Policy updates, spend recordings, agent registrations — all emit events that anyone can verify."

**[2:30 - 3:00] Closing**
- Show: Website landing page scrolling
- Voiceover: "Encliv. Policy-gated authorization for AI agents. Built on Flare Confidential Compute. Spend caps, allowlists, and time windows enforced at the hardware level — before any signature is ever created."
- End card: "Encliv — Built for Flare Summer Signal 2026"
