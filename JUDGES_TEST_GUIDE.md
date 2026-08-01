# 🧪 Encliv — Judge & Tester Quickstart Guide

This guide is designed for hackathon judges and reviewers to test **Encliv** in under **2 minutes**. 

> **No crypto wallet (MetaMask/Rabby), browser extensions, or testnet tokens are required.** Everything is pre-configured for 1-click execution.

---

## 🚀 How to Test (Step-by-Step)

### **Step 1: Open the Console**
1. Open your browser and go to: **`http://localhost:3000/console.html`**
2. Check the top right corner: You will see a green badge **`TEE Online`**.

---

### **Step 2: Generate the Enclave Address**
1. On the **Overview** page, click the purple **`Call GENERATE`** button.
2. **What happens:** The TEE generates an isolated keypair inside confidential memory and returns its public Ethereum address (e.g., `0xcbF51FF...`).
3. You will see the enclave address populated on the bottom left under **ENCLAVE ADDRESS**.

---

### **Step 3: Test a Valid Request (APPROVED)**
1. Click **`Test Transaction`** in the left sidebar menu.
2. Click the **`Valid Request`** preset button at the top.
3. Scroll down and click the purple **`Send to TEE`** button.
4. **Result:** You will see a green **`APPROVED — Transaction Signed`** banner!
   * *Why?* The request (0.5 C2FLR to `0x0000...0001`) is within the spend cap and sent to an allowlisted address.

---

### **Step 4: Test Spending Limit Enforcement (REFUSED)**
1. Click the **`Exceed Cap`** preset button at the top.
2. Click **`Send to TEE`**.
3. **Result:** You will see a red **`REFUSED — SPEND_CAP_EXCEEDED`** banner!
   * *Why?* The request asks to transfer 15 C2FLR, violating the agent's on-chain spend cap.

---

### **Step 5: Test Allowlist Security (REFUSED)**
1. Click the **`Bad Recipient`** preset button at the top.
2. Click **`Send to TEE`**.
3. **Result:** You will see a red **`REFUSED — NOT_IN_ALLOWLIST`** banner!
   * *Why?* The recipient address (`0x0000...dEaD`) is not on the agent's approved recipient list.

---

### **Step 6: Inspect Audit Logs & On-Chain Contract**
1. Click **`Event Log`** in the left sidebar to view the real-time, chronological audit trail of all approved and refused transaction attempts.
2. Open the verified smart contract on the Flare Coston2 Explorer:
   👉 **[EnclivPolicyRegistry on Blockscout](https://coston2-explorer.flare.network/address/0x8Bd0bA521F650ecFa9A261d6e2FD336655F172ed#code)**
