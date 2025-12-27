/**
 * CI5.DEV — Cork Registry Frontend
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Browse corks (public, no auth required)
 * - Rate corks (requires hardware verification)
 * - Submit corks (requires hardware verification)
 * - GitHub OAuth Device Flow
 * - Hardware challenge-response verification
 * 
 * Session Duration: π hours (3.14159... hours ≈ 3h 8m 30s)
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CI5_API = 'https://api.ci5.network';

const PI_HOURS_MS = Math.PI * 60 * 60 * 1000; 

const CONFIG = {
    clientId: 'Ov23liSwq6nuhqFog2xr',
    sessionTTL: PI_HOURS_MS,
    api: {
        deviceCode: 'https://github.com/login/device/code',
        pollToken: 'https://github.com/login/oauth/access_token'
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let REGISTRY_DATA = null;
let currentCorkKey = null;  // Track which cork is open in modal

const state = {
    user: null,
    accessToken: localStorage.getItem('gh_token'),
    deviceInterval: null,
    
    // Hardware verification
    sessionId: localStorage.getItem('ci5_session') || crypto.randomUUID(),
    hwVerified: false,
    hwid: null,
    pendingAction: null,
    verificationPollInterval: null
};

// Persist session ID
localStorage.setItem('ci5_session', state.sessionId);

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    injectHardwareModal();
    checkAuth();
    checkHardwareVerification();
    fetchCorks();
    
    // Search listener
    const searchBox = document.getElementById('search-box');
    if (searchBox) {
        searchBox.addEventListener('input', (e) => filterGrid(e.target.value));
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE VERIFICATION (π-hour sessions)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if current session is hardware-verified
 */
async function checkHardwareVerification() {
    try {
        const res = await fetch(`${CI5_API}/v1/identity/check?session=${state.sessionId}`);
        const data = await res.json();
        
        if (data.verified) {
            state.hwVerified = true;
            state.hwid = data.hwid;
            updateVerificationUI();
            console.log(`🔒 Hardware verified: ${state.hwid.substring(0, 8)}...`);
        }
    } catch (e) {
        console.warn('Hardware verification check failed:', e);
    }
}

/**
 * Request hardware verification (shows modal with challenge command)
 */
async function requestHardwareVerification() {
    // Generate challenge code
    const challenge = 'ci5_' + Math.random().toString(36).substring(2, 8);
    
    try {
        // Register challenge with backend (5 minute expiry for challenge itself)
        const res = await fetch(`${CI5_API}/v1/challenge/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                challenge,
                session_id: state.sessionId,
                expires: Date.now() + 300000  // 5 min to enter challenge
            })
        });
        
        if (!res.ok) {
            throw new Error('Failed to create challenge');
        }
        
        showHardwareModal(challenge);
        pollForVerification();
        
    } catch (e) {
        console.error('Failed to init verification:', e);
        alert('Verification service unavailable. Try again later.');
    }
}

/**
 * Show the hardware verification modal
 */
function showHardwareModal(challenge) {
    const modal = document.getElementById('hw-verify-modal');
    const cmdSpan = document.getElementById('hw-verify-command');
    
    if (modal && cmdSpan) {
        cmdSpan.textContent = `ci5 verify ${challenge}`;
        modal.classList.remove('hidden');
    }
}

/**
 * Hide the hardware verification modal
 */
function closeHardwareModal() {
    const modal = document.getElementById('hw-verify-modal');
    if (modal) modal.classList.add('hidden');
    
    // Clear polling
    if (state.verificationPollInterval) {
        clearInterval(state.verificationPollInterval);
        state.verificationPollInterval = null;
    }
    
    state.pendingAction = null;
}

/**
 * Copy verification command to clipboard
 */
function copyHardwareCommand() {
    const cmd = document.getElementById('hw-verify-command');
    if (cmd) {
        navigator.clipboard.writeText(cmd.textContent);
        cmd.style.color = '#fff';
        cmd.style.background = '#1a1a1a';
        setTimeout(() => {
            cmd.style.color = '#30d158';
            cmd.style.background = '#000';
        }, 1000);
    }
}

/**
 * Poll backend for verification completion
 */
function pollForVerification() {
    // Clear any existing poll
    if (state.verificationPollInterval) {
        clearInterval(state.verificationPollInterval);
    }
    
    state.verificationPollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${CI5_API}/v1/identity/check?session=${state.sessionId}`);
            const data = await res.json();
            
            if (data.verified) {
                clearInterval(state.verificationPollInterval);
                state.verificationPollInterval = null;
                
                state.hwVerified = true;
                state.hwid = data.hwid;
                
                // Hide modal
                closeHardwareModal();
                updateVerificationUI();
                
                // Execute pending action
                if (state.pendingAction) {
                    const action = state.pendingAction;
                    state.pendingAction = null;
                    action();
                }
            }
        } catch (e) {
            console.warn('Poll error:', e);
        }
    }, 2000);
    
    // Timeout after 5 minutes
    setTimeout(() => {
        if (state.verificationPollInterval) {
            clearInterval(state.verificationPollInterval);
            state.verificationPollInterval = null;
        }
    }, 300000);
}

/**
 * Update UI to show verification status
 */
function updateVerificationUI() {
    // Update submission form badge
    const badge = document.getElementById('form-user-badge');
    if (badge && state.user) {
        const hwStatus = state.hwVerified 
            ? `<span class="hw-verified-badge">🔒 VERIFIED</span>`
            : `<span class="hw-unverified-badge">⚠️ UNVERIFIED</span>`;
        badge.innerHTML = `<img src="${state.user.avatar_url}" alt="" class="badge-avatar"> ${state.user.login} ${hwStatus}`;
    }
    
    // Update telemetry button in cork modal
    updateTelemetryButton();
}

/**
 * Gate function - requires hardware verification before action
 */
function requireHardware(action) {
    // Must be logged in first
    if (!state.user) {
        startDeviceAuth();
        return;
    }
    
    // If verified, execute immediately
    if (state.hwVerified) {
        action();
        return;
    }
    
    // Otherwise, request verification
    state.pendingAction = action;
    requestHardwareVerification();
}

/**
 * Inject the hardware verification modal HTML
 */
function injectHardwareModal() {
    if (document.getElementById('hw-verify-modal')) return;
    
    const div = document.createElement('div');
    div.id = 'hw-verify-modal';
    div.className = 'modal-overlay hidden';
    div.onclick = (e) => { if (e.target.id === 'hw-verify-modal') closeHardwareModal(); };
    div.innerHTML = `
        <div class="modal-window" style="max-width:420px;">
            <div class="modal-header">
                <div class="app-icon large">🔒</div>
                <div class="modal-title-group">
                    <h2>Hardware Verification</h2>
                    <span class="signer-tag" style="color:#ff9f0a; border-color:#ff9f0a;">CI5-ASH REQUIRED</span>
                </div>
                <button class="close-btn" onclick="closeHardwareModal()">×</button>
            </div>
            <div class="modal-body" style="text-align:center;">
                <p class="desc-text">This action requires a verified Ci5 device.</p>
                <p class="desc-text" style="font-size:0.9em; color:#666;">Run this command on your Pi:</p>
                
                <div class="install-box" style="cursor:pointer;" onclick="copyHardwareCommand()">
                    <div class="install-label">VERIFICATION COMMAND</div>
                    <code id="hw-verify-command" style="font-size:1.1em;">ci5 verify ...</code>
                </div>
                
                <div class="auth-status" style="margin-top:20px;">
                    <span class="spinner-small"></span> Waiting for verification...
                </div>
                
                <p class="desc-text" style="font-size:0.8em; color:#555; margin-top:15px;">
                    Session valid for π hours (~3h 8m) after verification
                </p>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

// ═══════════════════════════════════════════════════════════════════════════
// GITHUB OAUTH (Device Flow)
// ═══════════════════════════════════════════════════════════════════════════

async function checkAuth() {
    if (!state.accessToken) {
        updateAuthUI();
        return;
    }
    
    try {
        const res = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${state.accessToken}` }
        });
        
        if (res.ok) {
            state.user = await res.json();
        } else {
            logout(true);  // Token expired
        }
    } catch (e) {
        console.error('Auth check failed:', e);
    }
    
    updateAuthUI();
}

function updateAuthUI() {
    const guest = document.getElementById('auth-guest');
    const userDiv = document.getElementById('auth-user');
    
    if (state.user) {
        if (guest) guest.classList.add('hidden');
        if (userDiv) userDiv.classList.remove('hidden');
        
        const avatar = document.getElementById('sidebar-avatar');
        const username = document.getElementById('sidebar-username');
        
        if (avatar) avatar.src = state.user.avatar_url;
        if (username) username.textContent = state.user.login;
        
        updateVerificationUI();
    } else {
        if (guest) guest.classList.remove('hidden');
        if (userDiv) userDiv.classList.add('hidden');
    }
}

async function startDeviceAuth() {
    const overlay = document.getElementById('auth-overlay');
    const loading = document.getElementById('auth-loading');
    const codeSec = document.getElementById('auth-code-section');
    
    if (overlay) overlay.classList.remove('hidden');
    if (loading) loading.classList.remove('hidden');
    if (codeSec) codeSec.classList.add('hidden');
    
    try {
        // Use CORS proxy for static site
        const res = await fetch('https://corsproxy.io/?' + encodeURIComponent(CONFIG.api.deviceCode), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ client_id: CONFIG.clientId, scope: 'public_repo' })
        });
        
        const data = await res.json();
        
        if (data.device_code) {
            if (loading) loading.classList.add('hidden');
            if (codeSec) codeSec.classList.remove('hidden');
            
            const codeDisplay = document.getElementById('user-code');
            if (codeDisplay) codeDisplay.textContent = data.user_code;
            
            pollForToken(data.device_code, data.interval || 5);
        } else {
            throw new Error('No device code received');
        }
    } catch (e) {
        console.error('Device auth failed:', e);
        alert('Authentication failed. Please try again.');
        closeAuthModal();
    }
}

function pollForToken(deviceCode, interval) {
    if (state.deviceInterval) clearInterval(state.deviceInterval);
    
    state.deviceInterval = setInterval(async () => {
        try {
            const res = await fetch('https://corsproxy.io/?' + encodeURIComponent(CONFIG.api.pollToken), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    client_id: CONFIG.clientId,
                    device_code: deviceCode,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                })
            });
            
            const data = await res.json();
            
            if (data.access_token) {
                clearInterval(state.deviceInterval);
                state.accessToken = data.access_token;
                localStorage.setItem('gh_token', data.access_token);
                closeAuthModal();
                checkAuth();
            } else if (data.error === 'slow_down') {
                clearInterval(state.deviceInterval);
                pollForToken(deviceCode, interval + 5);
            }
        } catch (e) {
            console.error('Poll error:', e);
        }
    }, (interval + 1) * 1000);
}

function closeAuthModal() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (state.deviceInterval) {
        clearInterval(state.deviceInterval);
        state.deviceInterval = null;
    }
}

function logout(silent = false) {
    if (!silent && !confirm('Disconnect from Ci5?')) return;
    
    state.user = null;
    state.accessToken = null;
    state.hwVerified = false;
    state.hwid = null;
    
    localStorage.removeItem('gh_token');
    localStorage.removeItem('ci5_session');
    
    // Generate new session ID
    state.sessionId = crypto.randomUUID();
    localStorage.setItem('ci5_session', state.sessionId);
    
    updateAuthUI();
    switchView('official');
}

// ═══════════════════════════════════════════════════════════════════════════
// CORK REGISTRY DATA
// ═══════════════════════════════════════════════════════════════════════════

async function fetchCorks() {
    try {
        const response = await fetch('corks.json');
        if (!response.ok) throw new Error('Manifest missing');
        
        REGISTRY_DATA = await response.json();
        
        const signerDisplay = document.getElementById('signer-display');
        if (signerDisplay && REGISTRY_DATA.meta) {
            signerDisplay.textContent = `AUTH: ${REGISTRY_DATA.meta.signing_authority}`;
        }
        
        switchView('official');
    } catch (e) {
        console.error('Failed to load corks:', e);
        const signerDisplay = document.getElementById('signer-display');
        if (signerDisplay) signerDisplay.textContent = 'OFFLINE MODE';
    }
}

function switchView(viewName, element) {
    // Require login for submission view
    if (viewName === 'submit' && !state.user) {
        startDeviceAuth();
        return;
    }
    
    const browser = document.getElementById('browser-view');
    const submission = document.getElementById('submission-view');
    const header = document.getElementById('section-header');
    const hero = document.getElementById('hero-card');
    
    // Update active nav item
    if (element) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
    }
    
    // Hide all views
    if (browser) browser.classList.add('hidden');
    if (submission) submission.classList.add('hidden');
    
    if (viewName === 'submit') {
        if (submission) submission.classList.remove('hidden');
        return;
    }
    
    if (browser) browser.classList.remove('hidden');
    
    const grid = document.getElementById('main-grid');
    if (grid) grid.innerHTML = '';
    
    if (!REGISTRY_DATA) return;
    
    switch (viewName) {
        case 'official':
            if (header) header.textContent = '🃏 ci5-canon-corks';
            if (hero) hero.classList.remove('hidden');
            renderRows(REGISTRY_DATA.official, true);
            break;
        case 'community':
            if (header) header.textContent = '🛸 Community Corks';
            if (hero) hero.classList.add('hidden');
            renderRows(REGISTRY_DATA.community, false);
            break;
        case 'top':
            if (header) header.textContent = '🌠 Top Rated';
            if (hero) hero.classList.add('hidden');
            renderRows(REGISTRY_DATA.community, false);
            break;
    }
}

function renderRows(corksObj, isOfficial) {
    const grid = document.getElementById('main-grid');
    if (!grid || !corksObj) return;
    
    Object.entries(corksObj).forEach(([key, cork]) => {
        const el = document.createElement('div');
        el.className = 'app-row';
        el.onclick = () => openDetail(key, isOfficial ? 'official' : 'community');
        
        let statusDot = '<span class="status-dot dot-unknown"></span>';
        if (cork.audit?.audit_result === 'SAFE') {
            statusDot = '<span class="status-dot dot-safe"></span>';
        } else if (cork.audit?.audit_result === 'SUSPICIOUS') {
            statusDot = '<span class="status-dot dot-warn"></span>';
        } else if (cork.audit?.audit_result === 'MALICIOUS') {
            statusDot = '<span class="status-dot dot-danger"></span>';
        }
        
        const submitter = cork.repo ? cork.repo.split('/')[0] : 'unknown';
        
        el.innerHTML = `
            <div class="app-icon">${getIconFor(key)}</div>
            <div class="app-details">
                <div class="app-name">${key}</div>
                <div class="app-cat">${statusDot} ${cork.ram || 'RAM?'} • ${isOfficial ? 'Signed' : 'Community'}</div>
                <div class="app-submitter">by ${submitter}</div>
            </div>
            <button class="get-btn">VIEW</button>
        `;
        grid.appendChild(el);
    });
}

function openDetail(key, type) {
    const cork = REGISTRY_DATA?.official?.[key] || REGISTRY_DATA?.community?.[key];
    if (!cork) return;
    
    currentCorkKey = key;  // Track current cork
    
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');
    const modalRam = document.getElementById('modal-ram');
    const modalIcon = document.getElementById('modal-icon');
    const modalCmd = document.getElementById('modal-cmd');
    const modalSource = document.getElementById('modal-source');
    const modalSubmitter = document.getElementById('modal-submitter');
    const modalTag = document.getElementById('modal-tag');
    
    if (modalTitle) modalTitle.textContent = key;
    if (modalDesc) modalDesc.textContent = cork.desc;
    if (modalRam) modalRam.textContent = cork.ram || 'Unknown';
    if (modalIcon) modalIcon.textContent = getIconFor(key);
    if (modalCmd) modalCmd.textContent = `ci5 install ${key}`;
    if (modalSource) modalSource.href = `https://github.com/${cork.repo}`;
    if (modalSubmitter) modalSubmitter.textContent = `by ${cork.repo ? cork.repo.split('/')[0] : 'unknown'}`;
    
    if (modalTag) {
        modalTag.textContent = type === 'official' ? 'OFFICIAL SIGNED' : 'COMMUNITY';
        modalTag.style.color = type === 'official' ? '#30d158' : '#ff9f0a';
        modalTag.style.borderColor = type === 'official' ? '#30d158' : '#ff9f0a';
    }
    
    // Update telemetry section
    updateTelemetryButton();
    loadCommunitySignal(key);
    
    toggleModal(true);
}

/**
 * Update the telemetry action button based on auth/verification state
 */
function updateTelemetryButton() {
    const btn = document.getElementById('telemetry-action-btn');
    if (!btn) return;
    
    if (!state.user) {
        btn.textContent = '🔑 LOGIN TO VOTE';
        btn.onclick = startDeviceAuth;
        btn.className = 'vote-btn disabled';
    } else if (!state.hwVerified) {
        btn.textContent = '🔒 VERIFY HARDWARE';
        btn.onclick = () => requireHardware(() => {});
        btn.className = 'vote-btn warning';
    } else {
        btn.textContent = '📡 SUBMIT SIGNAL';
        btn.onclick = submitVote;
        btn.className = 'vote-btn';
    }
}

/**
 * Load community signal data for a cork
 */
async function loadCommunitySignal(corkKey) {
    const box = document.getElementById('community-ram-box');
    if (!box) return;
    
    // Placeholder - in production, fetch from API
    box.innerHTML = `
        <div class="stat-label">COMMUNITY AVG RAM</div>
        <div class="stat-val">—</div>
        <div class="stat-sub">No votes yet</div>
    `;
    
    // TODO: Fetch actual telemetry from API
    // try {
    //     const res = await fetch(`${CI5_API}/v1/telemetry/${corkKey}`);
    //     const data = await res.json();
    //     ...
    // } catch (e) {}
}

function toggleModal(show) {
    const el = document.getElementById('modal-overlay');
    if (el) {
        if (show) el.classList.remove('hidden');
        else {
            el.classList.add('hidden');
            currentCorkKey = null;
        }
    }
}

function closeModal(e) {
    if (e.target.id === 'modal-overlay') toggleModal(false);
}

function copyCmd(el) {
    navigator.clipboard.writeText(el.textContent);
    const original = el.textContent;
    el.textContent = 'COPIED TO CLIPBOARD';
    el.style.color = '#fff';
    setTimeout(() => {
        el.textContent = original;
        el.style.color = '#30d158';
    }, 1500);
}

// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE-GATED ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate cork submission — REQUIRES HARDWARE VERIFICATION
 */
function generateSubmission() {
    requireHardware(() => {
        const name = document.getElementById('sub-name')?.value?.trim();
        const repo = document.getElementById('sub-repo')?.value?.trim();
        const desc = document.getElementById('sub-desc')?.value?.trim();
        const ram = document.getElementById('sub-ram')?.value;
        
        if (!name || !repo) {
            alert('Name and Repo are required.');
            return;
        }
        
        const repoPath = repo.replace('https://github.com/', '').replace(/\/$/, '');
        const hwidShort = state.hwid?.substring(0, 8) || 'unknown';
        
        const json = `"${name}": {
  "repo": "${repoPath}",
  "desc": "${desc || 'No description'}",
  "ram": "${ram}",
  "submitter_hwid": "${hwidShort}",
  "signature": null,
  "audit": null
}`;
        
        const title = `[Cork Submission] ${name}`;
        const body = `## New Cork Submission

### Registry Entry
\`\`\`json
${json}
\`\`\`

### Submitter Info
- **GitHub:** @${state.user.login}
- **Hardware ID:** \`${hwidShort}...\` (verified)
- **Submitted:** ${new Date().toISOString()}

### Checklist
- [ ] Cork builds successfully
- [ ] Tested on Pi 5 with Ci5
- [ ] No malicious code
- [ ] Accurate RAM estimate

---
*Submitted via ci5.dev with hardware verification*`;
        
        window.open(`https://github.com/dreamswag/ci5.dev/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=cork-submission`, '_blank');
    });
}

/**
 * Submit cork rating — REQUIRES HARDWARE VERIFICATION
 */
function submitVote() {
    requireHardware(async () => {
        const ram = document.getElementById('vote-ram')?.value;
        const status = document.getElementById('vote-status')?.value;
        const corkName = currentCorkKey || document.getElementById('modal-title')?.textContent;
        
        if (!corkName) {
            alert('No cork selected.');
            return;
        }
        
        const voteData = {
            cork: corkName,
            ram_mb: parseInt(ram),
            status: status,
            hwid: state.hwid,
            github: state.user.login,
            timestamp: Date.now()
        };
        
        console.log('📡 Vote submitted:', voteData);
        
        // TODO: POST to actual API
        // try {
        //     const res = await fetch(`${CI5_API}/v1/telemetry/vote`, {
        //         method: 'POST',
        //         headers: { 'Content-Type': 'application/json' },
        //         body: JSON.stringify(voteData)
        //     });
        //     if (!res.ok) throw new Error('Vote failed');
        // } catch (e) {
        //     alert('Failed to submit vote.');
        //     return;
        // }
        
        // Show success feedback
        const btn = document.getElementById('telemetry-action-btn');
        if (btn) {
            btn.textContent = '✓ SIGNAL SENT';
            btn.className = 'vote-btn success';
            setTimeout(() => updateTelemetryButton(), 2000);
        }
        
        alert(`Signal recorded for ${corkName}!\n\nRAM: ${ram}MB\nStatus: ${status}\nHWID: ${state.hwid?.substring(0, 8)}...`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function getIconFor(name) {
    const icons = {
        'adguard': '🛡️',
        'unbound': '🌐',
        'suricata': '👁️',
        'crowdsec': '🤖',
        'minecraft': '⛏️',
        'tor': '🧅',
        'bitcoin': '₿',
        'ethereum': 'Ξ',
        'monero': '🔒',
        'ntop': '📊',
        'pihole': '🕳️',
        'wireguard': '🔐',
        'nginx': '🌐',
        'home-assistant': '🏠',
        'paper': '📄'
    };
    
    for (const [key, icon] of Object.entries(icons)) {
        if (name.toLowerCase().includes(key)) return icon;
    }
    return '📦';
}

function filterGrid(query) {
    if (!query) {
        switchView('official');
        return;
    }
    
    const grid = document.getElementById('main-grid');
    const header = document.getElementById('section-header');
    const hero = document.getElementById('hero-card');
    
    if (!grid || !REGISTRY_DATA) return;
    
    if (header) header.textContent = `🔍 Search: "${query}"`;
    if (hero) hero.classList.add('hidden');
    
    grid.innerHTML = '';
    const all = { ...REGISTRY_DATA.official, ...REGISTRY_DATA.community };
    
    let count = 0;
    Object.entries(all).forEach(([k, v]) => {
        if (k.toLowerCase().includes(query.toLowerCase()) || 
            v.desc?.toLowerCase().includes(query.toLowerCase())) {
            count++;
            const isOfficial = !!REGISTRY_DATA.official[k];
            const el = document.createElement('div');
            el.className = 'app-row';
            el.onclick = () => openDetail(k, isOfficial ? 'official' : 'community');
            
            const submitter = v.repo ? v.repo.split('/')[0] : 'unknown';
            el.innerHTML = `
                <div class="app-icon">${getIconFor(k)}</div>
                <div class="app-details">
                    <div class="app-name">${k}</div>
                    <div class="app-cat">${v.ram || 'RAM?'} • ${isOfficial ? 'Signed' : 'Community'}</div>
                    <div class="app-submitter">by ${submitter}</div>
                </div>
                <button class="get-btn">VIEW</button>
            `;
            grid.appendChild(el);
        }
    });
    
    if (count === 0) {
        grid.innerHTML = '<div class="no-results">No corks found matching your search.</div>';
    }
}