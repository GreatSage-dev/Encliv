/* ═══════════════════════════════════════════════════════════════
   ENCLIV CONSOLE — Interactive Logic
   Connects to the TEE extension at localhost:3001
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
    const timeoutId = setTimeout(() => controller.abort(), 4000);
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
    // GENERATE
    $('#btnGenerate').addEventListener('click', async () => {
        const btn = $('#btnGenerate');
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
    });

    // REGISTER
    $('#registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const box = $('#registerResponse');

        const agentName = $('#regAgentName').value;
        const spendCap = $('#regSpendCap').value;
        const timeWindow = $('#regTimeWindow').value;
        const allowlist = $('#regAllowlist').value;
        const secondApproval = $('#regSecondApproval').checked;
        const threshold = $('#regThreshold').value;

        addLog('info', `Registering agent "${agentName}" — SpendCap: ${spendCap} C2FLR, Window: ${timeWindow}h`);

        const result = {
            status: 'REGISTER_PREPARED',
            agentId: hashString(agentName),
            policy: {
                spendCap: `${spendCap} C2FLR`,
                allowlist: [allowlist],
                timeWindow: `${timeWindow} hours`,
                requiresSecondApproval: secondApproval,
                secondApprovalThreshold: secondApproval ? `${threshold} C2FLR` : '0'
            },
            instructions: 'Execute `npm run demo` in `/demo` directory or deploy via Smart Contract to Coston2.'
        };

        box.textContent = JSON.stringify(result, null, 2);
        box.classList.add('visible');
    });

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
                    const match = result.details.match(/Expected nonce (?:>= )?(\d+)/);
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

    // Clear logs
    $('#btnClearLogs').addEventListener('click', () => {
        state.logs = [];
        $('#logContainer').innerHTML = '<div class="log-empty">No events yet.</div>';
    });
}

// ─── Scenarios ──────────────────────────────────────────────

function setupScenarios() {
    const scenarios = {
        valid: {
            agentName: 'demo-agent-1',
            to: '0x0000000000000000000000000000000000000001',
            amount: '0.5',
        },
        overspend: {
            agentName: 'demo-agent-1',
            to: '0x0000000000000000000000000000000000000001',
            amount: '15',
        },
        badrecipient: {
            agentName: 'demo-agent-1',
            to: '0x000000000000000000000000000000000000dEaD',
            amount: '0.5',
        }
    };

    $$('.scenario-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.scenario-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const s = scenarios[btn.dataset.scenario];
            if (s) {
                $('#txAgentName').value = s.agentName;
                $('#txTo').value = s.to;
                $('#txAmount').value = s.amount;
                $('#txNonce').value = state.currentNonce;
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
