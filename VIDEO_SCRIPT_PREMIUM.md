# 🎬 Encliv — Hackathon Demo Video Script (High Excellence)

**Target Duration:** 3 Minutes  
**Tone:** Confident, technical, authoritative, high-energy  
**Target Audience:** Flare Summer Signal Judges & Confidential Compute Evaluators  

---

## ⏱️ Timeline Overview

| Time | Segment | Core Focus |
|:---|:---|:---|
| **0:00 - 0:30** | **The Hook & Problem** | AI Agent Hot Key Vulnerability & Prompt Injection |
| **0:30 - 1:00** | **The Encliv Architecture** | TEE + Flare FTSO v2 + On-Chain Policy Registry |
| **1:00 - 2:00** | **Live Console Demonstration** | 1-Click KeyGen, Policy Approval & Real-Time Refusals |
| **2:00 - 2:30** | **On-Chain Audit & Verification** | Verified Coston2 Blockscout Explorer & Event Logs |
| **2:30 - 3:00** | **Fleet Infrastructure & Closing** | Reusable Agent Authorization Layer |

---

## 📜 Shot-by-Shot Script

### 🎬 Segment 1: The Hook & The Problem (0:00 – 0:30)

**[Screen Visual]**  
*Open on the Encliv Website hero section (`http://localhost:3000`). Scroll smoothly to the "Without Encliv vs With Encliv" security comparison card.*

**[Voiceover Script]**  
> "Autonomous AI agents are executing DeFi swaps, paying API fees, and managing treasuries right now. But there's a catastrophic flaw: **they hold raw private keys**.
> 
> A single prompt injection attack, a dependency exploit, or an unexpected LLM logic loop can cause an agent to drain its entire wallet in seconds. Traditional multisig wallets break autonomous agent workflows, and soft guardrails inside prompt text are trivial to bypass. 
> 
> **AI agents need hardware-enforced policy boundaries before any signature is ever created.** That’s why we built **Encliv**."

---

### 🎬 Segment 2: The Solution & Architecture (0:30 – 1:00)

**[Screen Visual]**  
*Switch to the interactive Architecture Flow Diagram on the landing page showing: `AI Agent ➔ TEE Enclave (Policy Check) ➔ Coston2 Chain (FTSO v2 Oracle)`.*

**[Voiceover Script]**  
> "Encliv is policy-gated authorization infrastructure built on **Flare Confidential Compute (FCC)**.
> 
> Here is how it works: 
> First, the wallet private key is generated *inside* a sealed Trusted Execution Environment at boot time — it never exists in agent code, logs, or disk storage.
> 
> Second, every signing request undergoes strict in-enclave evaluation against on-chain rules stored in `EnclivPolicyRegistry.sol` on Flare Coston2.
> 
> Third, using Flare’s native **FTSO v2 price oracle**, spend limits are dynamically calculated in USD — enforcing real-world daily caps like **$50/day** instead of hardcoded token counts."

---

### 🎬 Segment 3: Live Console Demo (1:00 – 2:00)

**[Screen Visual]**  
*Open the Encliv Console (`http://localhost:3000/console.html`). Show top-right badge: `TEE Online`.*

**[Voiceover Script]**  
> "Let’s look at the live Encliv Console.
> 
> **Step 1: In-Enclave KeyGen.** Clicking `Call GENERATE` triggers the enclave to generate an isolated secp256k1 keypair inside confidential memory, returning public address `0x01228e...`.
> 
> **Step 2: Policy Approval.** Under `Test Transaction`, we select `Valid Request` — sending 0.5 C2FLR to an allowlisted recipient. Clicking `Send to TEE` returns **APPROVED — Transaction Signed** in milliseconds. The enclave confirmed the spend was within the $50 FTSO cap and the recipient was authorized.
> 
> **Step 3: Spending Cap Enforcement.** Now we select `Exceed Cap` — requesting a 15 C2FLR transfer. Clicking `Send to TEE` immediately triggers **REFUSED — SPEND_CAP_EXCEEDED**. The enclave blocked the transaction at the hardware boundary before any signature was produced.
> 
> **Step 4: Allowlist Enforcement.** Finally, selecting `Bad Recipient` attempts a transfer to an unapproved address. The enclave instantly responds with **REFUSED — NOT_IN_ALLOWLIST**."

---

### 🎬 Segment 4: On-Chain Audit & Verification (2:00 – 2:30)

**[Screen Visual]**  
*Switch tab to Coston2 Blockscout Explorer showing the verified contract source code for `EnclivPolicyRegistry.sol` at `0x8Bd0bA521F650ecFa9A261d6e2FD336655F172ed`.*

**[Voiceover Script]**  
> "Every single action is publicly auditable. 
> 
> Here is our deployed smart contract on Flare Coston2 Blockscout — fully verified source code. 
> 
> Notice the contract state: spend counters are recorded on-chain, not in volatile enclave memory. Even if a TEE enclave restarts, spent history cannot be wiped or manipulated. Furthermore, event logs are indexed directly via Flare's official Coston2 Indexer Database."

---

### 🎬 Segment 5: Fleet Scale & Closing (2:30 – 3:00)

**[Screen Visual]**  
*Show the Event Log tab in the console with historical audit entries, then finish on the Encliv Website hero page.*

**[Voiceover Script]**  
> "Encliv is not a single-use agent wallet — it is reusable security infrastructure. Any autonomous agent fleet — like Custos on the OKX.AI marketplace — can register independent policies for spend caps, allowlists, and time windows.
> 
> Encliv brings hardware-level safety, Flare FTSO v2 pricing oracles, and transparent on-chain governance to the AI agent economy.
> 
> Thank you for evaluating Encliv — built for the Flare Summer Signal Hackathon."

---

## 🎯 Recording Tips for Maximum Impact

1. **Screen Resolution:** Record in **1080p (1920x1080)** or **4K** with browser zoom set to 100%.
2. **Audio:** Use a noise-canceling microphone or quiet room. Speak clearly and briskly.
3. **Pacing:** Let the visual complete on screen 1 second before describing the result (e.g. click `Send to TEE`, show the green banner, then state "APPROVED").
4. **Links in Video Description:**
   * Contract: `https://coston2-explorer.flare.network/address/0x8Bd0bA521F650ecFa9A261d6e2FD336655F172ed#code`
   * Console: `http://localhost:3000/console.html`
