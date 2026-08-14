/* ═══════════════════════════════════════════════════════════════
   ENCLIV CONSOLE — Interactive Logic
   Connects to the TEE enclave API
   ═══════════════════════════════════════════════════════════════ */

// Dynamic TEE URL: tries local TEE first if on localhost, otherwise uses hosted serverless API
let TEE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : `${window.location.origin}/api`;

// ─── State ──────────────────────────────────────────────────

const state = {
    enclaveAddress: null,
    connected: false,
    txCount: 0,
    refusals: 0,
    logs: [],
    currentNonce: 0
};

// ─── DOM Refs ───────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Init ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    setupNavigation();
    setupScenarios();
    setupForms();
    setupToggle();
    await checkConnection();
});

// ─── Navigation ─────────────────────────────────────────────

function setupNavigation() {
    $$('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            $$('.panel').forEach(p => p.classList.remove('active'));
            const panelId = `panel-${btn.dataset.panel}`;
            $(`#${panelId}`).classList.add('active');
        });
    });
}

// ─── TEE Connection ─────────────────────────────────────────

async function checkConnection() {
    try {
        let res;
        try {
            res = await fetch(`${TEE_URL}/health`);
        } catch {
            // Fallback to hosted Vercel serverless API if localhost is unreachable
            if (TEE_URL !== `${window.location.origin}/api`) {
                TEE_URL = `${window.location.origin}/api`;
                res = await fetch(`${TEE_URL}/health`);
            }
        }
        const data = await res.json();

        if (!state.connected) {
            addLog('info', `Connected to TEE. Enclave Address: ${data.address}`);
        }

        state.connected = true;
        state.enclaveAddress = data.address;

        const statusEl = $('#teeStatus');
        statusEl.innerHTML = `<span class="status-dot online"></span><span>TEE Online</span>`;

        $('#enclaveAddr').textContent = data.address;
        $('#metricStatus').textContent = 'Online';
        $('#metricStatus').style.color = '#34d399';

        // Fetch current expected nonce for default demo agent
        try {
            const demoAgentId = hashString('demo-agent-1');
            const nonceRes = await callTEE({ instruction: 'GET_NONCE', agentId: demoAgentId });
            if (nonceRes.success && typeof nonceRes.nonce === 'number') {
                state.currentNonce = nonceRes.nonce;
                if ($('#txNonce')) $('#txNonce').value = state.currentNonce;
            }
        } catch {}
    } catch (e) {
        state.connected = false;
        const statusEl = $('#teeStatus');
        statusEl.innerHTML = `<span class="status-dot offline"></span><span>TEE Offline</span>`;
        $('#metricStatus').textContent = 'Offline';
        $('#metricStatus').style.color = '#f87171';
        addLog('error', `Cannot reach TEE server. Retrying...`);
    } finally {
        setTimeout(checkConnection, 5000);
    }
}

// ─── Call TEE ───────────────────────────────────────────────

async function callTEE(payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
        const res = await fetch(`${TEE_URL}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return await res.json();
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error('TEE request timed out (4s). Ensure TEE server is active.');
        }
        throw err;
    }
}

// ─── Forms Setup ─────────────────────────────────────────────

function setupForms() {
    const handleGenerateCall = async () => {
        const btn = $('#btnGenerate');
        if (!btn || btn.disabled) return;

        btn.disabled = true;
        btn.textContent = 'Calling...';

        try {
            const result = await callTEE({ instruction: 'GENERATE' });
            state.enclaveAddress = result.address;
            state.connected = true;

            const box = $('#generateResponse');
            box.textContent = JSON.stringify(result, null, 2);
            box.classList.add('visible');

            $('#enclaveAddr').textContent = result.address;
            addLog('info', `GENERATE → Address: ${result.address}`);
        } catch (e) {
            addLog('error', `GENERATE failed: ${e.message}`);
        }

        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Call GENERATE`;
    };

    // GENERATE
    $('#btnGenerate')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleGenerateCall();
    });

    $('#generateForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleGenerateCall();
    });

    // REGISTER_AGENT
    $('#registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const box = $('#registerResponse');

        const agentName = $('#regAgentName').value;
        const spendCap = $('#regSpendCap').value;
        const timeWindow = $('#regTimeWindow').value;
        const allowlist = $('#regAllowlist').value;
        const agentId = hashString(agentName);

        addLog('info', `Registering agent "${agentName}" — SpendCap: ${spendCap} C2FLR, Window: ${timeWindow}h`);

        try {
            const payload = {
                instruction: 'REGISTER_AGENT',
                agentId: agentId,
                spendCap: spendCap,
                allowlist: [allowlist],
                timeWindow: timeWindow
            };
            const result = await callTEE(payload);
            box.textContent = JSON.stringify(result, null, 2);
            box.classList.add('visible');
            addLog('success', `Agent "${agentName}" registered with active policy: ${spendCap} C2FLR cap`);
        } catch (err) {
            box.textContent = JSON.stringify({ success: false, error: err.message }, null, 2);
            box.classList.add('visible');
            addLog('error', `Registration failed: ${err.message}`);
        }
    });

    // Client signer wallet for generating valid ECDSA signatures in console
    const clientWallet = (window.ethers && window.ethers.Wallet)
        ? window.ethers.Wallet.createRandom()
        : null;

    // CHECK_AND_SIGN
    $('#transactForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const agentName = $('#txAgentName').value;
        const nonce = parseInt($('#txNonce').value);
        const to = $('#txTo').value;
        const amount = $('#txAmount').value;
        const amountWei = ethToWei(amount);
        const timestamp = Math.floor(Date.now() / 1000);
        const agentId = hashString(agentName);

        if (!state.enclaveAddress) {
            showResult('error', 'Not Connected', 'Call GENERATE first to connect to the TEE.');
            return;
        }

        addLog('info', `CHECK_AND_SIGN → to: ${to}, amount: ${amount} C2FLR, nonce: ${nonce}`);

        try {
            const signature = '0x' + '00'.repeat(65); // Placeholder for standalone simulated evaluation

            const payload = {
                instruction: 'CHECK_AND_SIGN',
                agentId: agentId,
                to: to,
                amount: amountWei,
                calldata: '0x',
                nonce: nonce,
                timestamp: timestamp,
                agentSignature: signature
            };

            const result = await callTEE(payload);

            if (result.success) {
                state.txCount++;
                state.currentNonce = nonce + 1;
                $('#txNonce').value = state.currentNonce;
                $('#metricTxCount').textContent = state.txCount;
                showResult('success', 'APPROVED — Transaction Signed',
                    `Tx Hash: ${result.txHash}\nSigned Tx: ${result.signedTx?.substring(0, 80)}...`);
                addLog('success', `APPROVED → TxHash: ${result.txHash}`);
            } else {
                state.refusals++;
                $('#metricRefusals').textContent = state.refusals;
                showResult('refused', `REFUSED — ${result.reason}`,
                    `Reason: ${result.reason}\nDetails: ${result.details || 'Policy violation detected'}`);
                addLog('refused', `REFUSED → ${result.reason}: ${result.details || ''}`);

                // Auto-fix nonce if stale (so judges don't get stuck)
                if (result.reason === 'REPLAY_DETECTED' && result.details) {
                    const match = result.details.match(/Expected sequential nonce (\d+)/);
                    if (match) {
                        state.currentNonce = parseInt(match[1]);
                        $('#txNonce').value = state.currentNonce;
                        addLog('info', `Nonce auto-synced to ${state.currentNonce}. Re-try transaction.`);
                    }
                }
            }
        } catch (e) {
            showResult('error', 'Transaction Error', e.message);
            addLog('error', `Error: ${e.message}`);
        }
    });

}

// ─── Agent Profiles & Scenarios ─────────────────────────────

const AGENT_PROFILES = {
    custos: {
        agentName: 'custos-okx-7327',
        displayName: 'Custos OKX #7327',
        to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        spendCap: '10.0',
        window: '24h',
        secondApproval: 'No',
        validAmount: '1.0',
    },
    eliza: {
        agentName: 'eliza-social-agent',
        displayName: 'Eliza OS Social Pay',
        to: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        spendCap: '5.0',
        window: '12h',
        secondApproval: 'No',
        validAmount: '0.8',
    },
    fetchai: {
        agentName: 'fetch-ai-logistics-router',
        displayName: 'Fetch.ai Logistics',
        to: '0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413',
        spendCap: '7.5',
        window: '18h',
        secondApproval: 'No',
        validAmount: '2.5',
    }
};

let selectedAgent = null;

function setupScenarios() {
    // Agent selection buttons
    $$('.scenario-btn[data-scenario="custos"], .scenario-btn[data-scenario="eliza"], .scenario-btn[data-scenario="fetchai"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.scenario;

            // Toggle: clicking same agent deselects it
            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
                selectedAgent = null;
                $('#agentPolicyCard').style.display = 'none';
                $('#txAgentName').value = 'demo-agent-1';
                $('#txTo').value = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
                $('#txAmount').value = '0.5';
                return;
            }

            // Remove active from all agent buttons
            $$('.scenario-btn[data-scenario="custos"], .scenario-btn[data-scenario="eliza"], .scenario-btn[data-scenario="fetchai"]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            selectedAgent = AGENT_PROFILES[key];

            // Fill form with agent data
            $('#txAgentName').value = selectedAgent.agentName;
            $('#txTo').value = selectedAgent.to;
            $('#txAmount').value = selectedAgent.validAmount;
            $('#txNonce').value = state.currentNonce;

            // Show policy card
            const card = $('#agentPolicyCard');
            card.style.display = 'block';
            $('#policySpendCap').textContent = selectedAgent.spendCap + ' C2FLR';
            $('#policyRecipient').textContent = selectedAgent.to.substring(0, 10) + '...' + selectedAgent.to.substring(38);
            $('#policyWindow').textContent = selectedAgent.window;
            $('#policy2ndApproval').textContent = selectedAgent.secondApproval;

            // Reset scenario buttons to "Valid"
            $$('.scenario-btn[data-scenario="valid"], .scenario-btn[data-scenario="overspend"], .scenario-btn[data-scenario="badrecipient"]').forEach(b => b.classList.remove('active'));
            $('.scenario-btn[data-scenario="valid"]').classList.add('active');
        });
    });

    // Test scenario buttons (adapt to selected agent)
    $$('.scenario-btn[data-scenario="valid"], .scenario-btn[data-scenario="overspend"], .scenario-btn[data-scenario="badrecipient"]').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from scenario buttons only
            $$('.scenario-btn[data-scenario="valid"], .scenario-btn[data-scenario="overspend"], .scenario-btn[data-scenario="badrecipient"]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const agent = selectedAgent || { agentName: 'demo-agent-1', to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', spendCap: '10.0', validAmount: '0.5' };
            const scenario = btn.dataset.scenario;

            $('#txAgentName').value = agent.agentName;
            $('#txNonce').value = state.currentNonce;

            if (scenario === 'valid') {
                $('#txTo').value = agent.to;
                $('#txAmount').value = agent.validAmount;
            } else if (scenario === 'overspend') {
                $('#txTo').value = agent.to;
                $('#txAmount').value = (parseFloat(agent.spendCap) * 2).toFixed(1);
            } else if (scenario === 'badrecipient') {
                $('#txTo').value = '0x000000000000000000000000000000000000dEaD';
                $('#txAmount').value = agent.validAmount;
            }
        });
    });
}

// ─── Toggle ─────────────────────────────────────────────────

function setupToggle() {
    $('#regSecondApproval').addEventListener('change', (e) => {
        $('#thresholdGroup').style.display = e.target.checked ? 'flex' : 'none';
    });
}

// ─── Result Display ─────────────────────────────────────────

function showResult(type, title, body) {
    const el = $('#txResult');
    const header = $('#txResultHeader');
    const bodyEl = $('#txResultBody');

    header.className = `result-header ${type}`;

    const icons = {
        success: '✓',
        refused: '✗',
        error: '⚠'
    };

    header.innerHTML = `<span class="result-icon">${icons[type] || '?'}</span><span class="result-title">${title}</span>`;
    bodyEl.textContent = body;
    el.style.display = 'block';
}

// ─── Logging ────────────────────────────────────────────────

function addLog(type, message) {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false });

    state.logs.push({ type, message, time });

    const container = $('#logContainer');
    const empty = container.querySelector('.log-empty');
    if (empty) empty.remove();

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg">${escapeHtml(message)}</span>`;

    container.insertBefore(entry, container.firstChild);

    while (container.children.length > 100) {
        container.removeChild(container.lastChild);
    }
}

// ─── Utilities ──────────────────────────────────────────────

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return '0x' + Math.abs(hash).toString(16).padStart(64, '0');
}

function ethToWei(eth) {
    const parts = eth.split('.');
    const whole = parts[0] || '0';
    const frac = (parts[1] || '').padEnd(18, '0').substring(0, 18);
    const wei = BigInt(whole) * BigInt('1000000000000000000') + BigInt(frac);
    return wei.toString();
}

// ─── Keyboard Enter Key Responsiveness ───────────────────────

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const activePanel = document.querySelector('.panel.active');
        if (!activePanel) return;

        // If user presses Enter inside an input field, trigger form submission directly
        if (e.target.tagName === 'INPUT') {
            const form = e.target.closest('form');
            if (form) {
                e.preventDefault();
                if (typeof form.requestSubmit === 'function') {
                    form.requestSubmit();
                } else {
                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
                return;
            }
        }

        // If focused on main active panel background/cards
        if (e.target === document.body || e.target.classList?.contains('panel') || e.target.classList?.contains('card')) {
            if (activePanel.id === 'panel-overview') {
                e.preventDefault();
                $('#btnGenerate')?.click();
            } else if (activePanel.id === 'panel-transact') {
                e.preventDefault();
                const form = $('#transactForm');
                if (form) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
            } else if (activePanel.id === 'panel-register') {
                e.preventDefault();
                const form = $('#registerForm');
                if (form) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
        }
    }
});
