// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFtsoV2 {
    function getFeedById(bytes21 feedId) external view returns (uint256 value, int8 decimals, uint64 timestamp);
}

interface IContractRegistry {
    function getContractAddressByName(string calldata name) external view returns (address);
}

/**
 * @title EnclivPolicyRegistry
 * @dev Manages policies for TEE agents and records their spends, integrated with Flare FTSO v2 for USD-denominated spend caps.
 */
contract EnclivPolicyRegistry is ReentrancyGuard {
    // Flare Contract Registry Address (Coston2 / Songbird / Flare Mainnet)
    address public constant FLARE_CONTRACT_REGISTRY = 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019;
    // FLR/USD Feed ID in FTSO v2 (0x01464c522f55534400000000000000000000000000)
    bytes21 public constant FLR_USD_FEED_ID = 0x01464c522f55534400000000000000000000000000;

    struct Policy {
        uint256 spendCap;              // Max spend per time window (in wei or USD cents based on isUsdDenominated)
        address[] allowlist;           // Allowed recipient addresses
        uint64 timeWindowStart;        // Window start timestamp
        uint64 timeWindowEnd;          // Window end timestamp  
        bool requiresSecondApproval;
        uint256 secondApprovalThreshold; // Amount above which 2nd approval needed
        bool isUsdDenominated;         // If true, spendCap is in USD cents ($50 = 5000) using FTSO v2 oracle
    }

    struct AgentRecord {
        address agentOwner;            // ECDSA owner for caller authentication in TEE
        address enclaveAddress;        // TEE-generated wallet address authorized to call recordSpend
        Policy policy;
        uint256 currentWindowSpent;    // On-chain spend tracking in wei
        bool isRegistered;
    }

    mapping(bytes32 => AgentRecord) private _agents;

    event AgentRegistered(bytes32 indexed agentId, address indexed agentOwner, uint256 spendCap, bool isUsdDenominated, uint256 timestamp);
    event PolicyUpdated(bytes32 indexed agentId, uint256 newSpendCap, uint64 newWindowStart, uint64 newWindowEnd, uint256 timestamp);
    event EnclaveAddressSet(bytes32 indexed agentId, address indexed enclaveAddress, uint256 timestamp);
    event SpendRecorded(bytes32 indexed agentId, uint256 amount, uint256 totalSpentWei, uint256 timestamp);

    modifier onlyAgentOwner(bytes32 agentId) {
        require(_agents[agentId].isRegistered, "Agent not registered");
        require(_agents[agentId].agentOwner == msg.sender, "Caller is not agent owner");
        _;
    }

    modifier onlyEnclave(bytes32 agentId) {
        require(_agents[agentId].isRegistered, "Agent not registered");
        require(_agents[agentId].enclaveAddress == msg.sender, "Caller is not enclave address");
        _;
    }

    /**
     * @dev Fetches current FLR/USD price from Flare FTSO v2 oracle on Coston2.
     * Uses ContractRegistry.getContractAddressByName("FtsoV2") to resolve the live FtsoV2 contract.
     */
    function getFlrUsdPrice() public view returns (uint256 price, int8 decimals, uint64 timestamp) {
        if (FLARE_CONTRACT_REGISTRY.code.length > 0) {
            try IContractRegistry(FLARE_CONTRACT_REGISTRY).getContractAddressByName("FtsoV2") returns (address ftsoV2Addr) {
                if (ftsoV2Addr != address(0) && ftsoV2Addr.code.length > 0) {
                    return IFtsoV2(ftsoV2Addr).getFeedById(FLR_USD_FEED_ID);
                }
            } catch {}
        }
        // Fallback for local testing / mock environment: $0.02 per FLR (decimals = 5, price = 2000)
        return (2000, 5, uint64(block.timestamp));
    }

    /**
     * @dev Converts a FLR wei amount to USD Cents using FTSO v2.
     */
    function convertWeiToUsdCents(uint256 weiAmount) public view returns (uint256) {
        (uint256 price, int8 decimals, ) = getFlrUsdPrice();
        if (price == 0) return 0;
        uint256 base = 10**uint256(int256(decimals));
        uint256 usdAmount = (weiAmount * price * 100) / (base * 1e18);
        return usdAmount;
    }

    /**
     * @dev Registers a new agent.
     */
    function registerAgent(bytes32 agentId, address agentOwner, Policy calldata initialPolicy) external {
        require(!_agents[agentId].isRegistered, "Agent already registered");
        require(agentOwner != address(0), "Invalid owner address");
        require(msg.sender == agentOwner, "Caller must be agent owner");
        require(initialPolicy.timeWindowEnd > initialPolicy.timeWindowStart, "Invalid time window");

        AgentRecord storage agent = _agents[agentId];
        agent.agentOwner = agentOwner;
        agent.policy = initialPolicy;
        agent.isRegistered = true;

        emit AgentRegistered(agentId, agentOwner, initialPolicy.spendCap, initialPolicy.isUsdDenominated, block.timestamp);
    }

    /**
     * @dev Updates the policy for an existing agent.
     */
    function updatePolicy(bytes32 agentId, Policy calldata newPolicy) external onlyAgentOwner(agentId) {
        require(newPolicy.timeWindowEnd > newPolicy.timeWindowStart, "Invalid time window");
        _agents[agentId].policy = newPolicy;
        
        emit PolicyUpdated(
            agentId, 
            newPolicy.spendCap, 
            newPolicy.timeWindowStart, 
            newPolicy.timeWindowEnd, 
            block.timestamp
        );
    }

    /**
     * @dev Sets the enclave address for an agent.
     */
    function setEnclaveAddress(bytes32 agentId, address enclaveAddr) external onlyAgentOwner(agentId) {
        require(enclaveAddr != address(0), "Invalid enclave address");
        _agents[agentId].enclaveAddress = enclaveAddr;
        
        emit EnclaveAddressSet(agentId, enclaveAddr, block.timestamp);
    }

    /**
     * @dev Records a spend for an agent.
     */
    function recordSpend(bytes32 agentId, uint256 amount) external nonReentrant onlyEnclave(agentId) {
        AgentRecord storage agent = _agents[agentId];
        
        require(block.timestamp >= agent.policy.timeWindowStart && block.timestamp <= agent.policy.timeWindowEnd, "Outside time window");
        
        uint256 newTotalSpent = agent.currentWindowSpent + amount;

        if (agent.policy.isUsdDenominated) {
            uint256 spentInUsdCents = convertWeiToUsdCents(newTotalSpent);
            require(spentInUsdCents <= agent.policy.spendCap, "Exceeds USD spend cap (FTSO v2)");
        } else {
            require(newTotalSpent <= agent.policy.spendCap, "Exceeds spend cap");
        }

        agent.currentWindowSpent = newTotalSpent;

        emit SpendRecorded(agentId, amount, agent.currentWindowSpent, block.timestamp);
    }

    /**
     * @dev Gets the policy of an agent.
     */
    function getAgentPolicy(bytes32 agentId) external view returns (AgentRecord memory) {
        require(_agents[agentId].isRegistered, "Agent not registered");
        return _agents[agentId];
    }

    /**
     * @dev Checks if an address is in the agent's allowlist.
     */
    function isAllowlisted(bytes32 agentId, address target) external view returns (bool) {
        require(_agents[agentId].isRegistered, "Agent not registered");
        
        address[] memory allowlist = _agents[agentId].policy.allowlist;
        for (uint256 i = 0; i < allowlist.length; i++) {
            if (allowlist[i] == target) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Resets the spend window for an agent.
     */
    function resetSpendWindow(bytes32 agentId, uint64 newWindowStart, uint64 newWindowEnd) external onlyAgentOwner(agentId) {
        require(newWindowEnd > newWindowStart, "Invalid time window");
        AgentRecord storage agent = _agents[agentId];
        
        agent.currentWindowSpent = 0;
        agent.policy.timeWindowStart = newWindowStart;
        agent.policy.timeWindowEnd = newWindowEnd;

        emit PolicyUpdated(
            agentId, 
            agent.policy.spendCap, 
            newWindowStart, 
            newWindowEnd, 
            block.timestamp
        );
    }
}
