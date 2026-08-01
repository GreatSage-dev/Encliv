import { expect } from "chai";
import { ethers } from "hardhat";
import { EnclivPolicyRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("EnclivPolicyRegistry", function () {
  let registry: EnclivPolicyRegistry;
  let owner: SignerWithAddress;
  let agentOwner: SignerWithAddress;
  let enclave: SignerWithAddress;
  let other: SignerWithAddress;
  let target1: SignerWithAddress;

  const agentId = ethers.id("agent1");

  const buildPolicy = (start: number, end: number, isUsdDenominated = false, spendCap = ethers.parseEther("10")) => ({
    spendCap: spendCap,
    allowlist: [target1.address],
    timeWindowStart: start,
    timeWindowEnd: end,
    requiresSecondApproval: false,
    secondApprovalThreshold: ethers.parseEther("5"),
    isUsdDenominated: isUsdDenominated,
  });

  beforeEach(async function () {
    [owner, agentOwner, enclave, other, target1] = await ethers.getSigners();

    const EnclivPolicyRegistryFactory = await ethers.getContractFactory("EnclivPolicyRegistry");
    registry = await EnclivPolicyRegistryFactory.deploy();
    await registry.waitForDeployment();
  });

  describe("Agent Registration", function () {
    it("Should register a new agent", async function () {
      const now = await time.latest();
      const policy = buildPolicy(now, now + 3600);

      const tx = await registry.connect(agentOwner).registerAgent(agentId, agentOwner.address, policy);
      
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      
      await expect(tx)
        .to.emit(registry, "AgentRegistered")
        .withArgs(agentId, agentOwner.address, policy.spendCap, false, block!.timestamp);
        
      const record = await registry.getAgentPolicy(agentId);
      expect(record.isRegistered).to.be.true;
      expect(record.agentOwner).to.equal(agentOwner.address);
    });

    it("Should reject duplicate registration", async function () {
      const now = await time.latest();
      const policy = buildPolicy(now, now + 3600);

      await registry.connect(agentOwner).registerAgent(agentId, agentOwner.address, policy);
      await expect(registry.connect(agentOwner).registerAgent(agentId, agentOwner.address, policy)).to.be.revertedWith("Agent already registered");
    });

    it("Should reject registration with zero address owner", async function () {
      const now = await time.latest();
      const policy = buildPolicy(now, now + 3600);
      await expect(registry.registerAgent(agentId, ethers.ZeroAddress, policy)).to.be.revertedWith("Invalid owner address");
    });

    it("Should reject registration when caller is not owner", async function () {
      const now = await time.latest();
      const policy = buildPolicy(now, now + 3600);
      await expect(registry.connect(other).registerAgent(agentId, agentOwner.address, policy)).to.be.revertedWith("Caller must be agent owner");
    });

    it("Should reject registration with invalid time window", async function () {
      const now = await time.latest();
      const policy = buildPolicy(now + 3600, now);
      await expect(registry.connect(agentOwner).registerAgent(agentId, agentOwner.address, policy)).to.be.revertedWith("Invalid time window");
    });
  });

  describe("Policy Management", function () {
    beforeEach(async function () {
      const now = await time.latest();
      const policy = buildPolicy(now, now + 3600);
      await registry.connect(agentOwner).registerAgent(agentId, agentOwner.address, policy);
    });

    it("Should allow agent owner to update policy", async function () {
      const now = await time.latest();
      const newPolicy = buildPolicy(now, now + 7200);

      await expect(registry.connect(agentOwner).updatePolicy(agentId, newPolicy))
        .to.emit(registry, "PolicyUpdated");
    });

    it("Should reject unauthorized policy update", async function () {
      const now = await time.latest();
      const newPolicy = buildPolicy(now, now + 7200);

      await expect(registry.connect(other).updatePolicy(agentId, newPolicy))
        .to.be.revertedWith("Caller is not agent owner");
    });

    it("Should reject policy update with invalid time window", async function () {
      const now = await time.latest();
      const newPolicy = buildPolicy(now + 7200, now);
      await expect(registry.connect(agentOwner).updatePolicy(agentId, newPolicy)).to.be.revertedWith("Invalid time window");
    });
  });

  describe("FTSO v2 Oracle USD Spend Cap", function () {
    it("Should correctly convert wei to USD cents using FTSO fallback price", async function () {
      // 100 FLR in wei = 100 * 1e18
      // Fallback FLR price = $0.02 (2000 with 5 decimals)
      // 100 FLR * $0.02 = $2.00 = 200 USD cents
      const flrAmount = ethers.parseEther("100");
      const usdCents = await registry.convertWeiToUsdCents(flrAmount);
      expect(usdCents).to.equal(200n);
    });

    it("Should enforce USD-denominated spend cap ($50 / 5000 cents)", async function () {
      const now = await time.latest();
      // Set cap to 5000 cents ($50.00)
      const usdPolicy = buildPolicy(now, now + 3600, true, 5000n);
      await registry.connect(agentOwner).registerAgent(agentId, agentOwner.address, usdPolicy);
      await registry.connect(agentOwner).setEnclaveAddress(agentId, enclave.address);

      // Spend 1000 FLR ($20.00 at $0.02/FLR) -> Allowed
      const spend1 = ethers.parseEther("1000");
      await expect(registry.connect(enclave).recordSpend(agentId, spend1)).to.emit(registry, "SpendRecorded");

      // Spend another 2000 FLR ($40.00 at $0.02/FLR) -> Total $60.00 > $50.00 cap -> Revert
      const spend2 = ethers.parseEther("2000");
      await expect(registry.connect(enclave).recordSpend(agentId, spend2)).to.be.revertedWith("Exceeds USD spend cap (FTSO v2)");
    });
  });

  describe("Spend Recording", function () {
    beforeEach(async function () {
      const now = await time.latest();
      const policy = buildPolicy(now, now + 3600);
      await registry.connect(agentOwner).registerAgent(agentId, agentOwner.address, policy);
      await registry.connect(agentOwner).setEnclaveAddress(agentId, enclave.address);
    });

    it("Should record valid spend", async function () {
      const amount = ethers.parseEther("1");
      await expect(registry.connect(enclave).recordSpend(agentId, amount))
        .to.emit(registry, "SpendRecorded")
        .withArgs(agentId, amount, amount, (await time.latest()) + 1);
    });

    it("Should reject spend exceeding cap", async function () {
      const amount = ethers.parseEther("11");
      await expect(registry.connect(enclave).recordSpend(agentId, amount))
        .to.be.revertedWith("Exceeds spend cap");
    });
  });
});
