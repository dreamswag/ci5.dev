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
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CI5_API = 'https://api.ci5.network';

const CONFIG = {
    clientId: 'Ov23liSwq6nuhqFog2xr',  
    api: {
        deviceCode: 'https://github.com/login/device/code',
        pollToken: 'https://github.com/login/oauth/access_token'
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let REGISTRY_DATA = null;

const state = {
    user: null,
    accessToken: localStorage.getItem('gh_token'),
    deviceInterval: null,
    
    // Hardware verification
    sessionId: localStorage.getItem('ci5_session') || crypto.randomUUID(),
    hwVerified: false,
    hwid: null,
    pendingAction: null
};

// Persist session ID
localStorage.setItem('ci5_session', state.sessionId);

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    injectModalHTML();
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
// HARDWARE VERIFICATION
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
        // Register challenge with backend
        const res = await fetch(`${CI5_API}/v1/challenge/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                challenge,
                session_id: state.sessionId,
                expires: Date.now() + 300000  // 5 minutes
            })
        });
        
        if (!res.ok) {
            throw new Error('Failed to create challenge');
        }
        
        showVerificationModal(challenge);
        pollForVerification();
        
    } catch (e) {
        console.error('Failed to init verification:', e);
        alert('Verification service unavailable. Try again later.');
    }
}

/**
 * Show the verification modal with challenge command
 */
function showVerificationModal(challenge) {
    const modal = document.getElementById('hw-verify-modal');
    const cmdSpan = document.getElementById('verify-command');
    
    if (modal && cmdSpan) {
        cmdSpan.textContent = `ci5 verify ${challenge}`;
        modal.classList.remove('hidden');
    }
}

/**
 * Poll backend for verification completion
 */
function pollForVerification() {
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`${CI5_API}/v1/identity/check?session=${state.sessionId}`);
            const data = await res.json();
            
            if (data.verified) {
                clearInterval(interval);
                state.hwVerified = true;
                state.hwid = data.hwid;
                
                // Hide modal
                const modal = document.getElementById('hw-verify-modal');
                if (modal) modal.classList.add('hidden');
                
                updateVerificationUI();
                
                // Execute pending action
                if (state.pendingAction) {
                    state.pendingAction();
                    state.pendingAction = null;
                }
            }
        } catch (e) {
            console.warn('Poll error:', e);
        }
    }, 2000);
    
    // Timeout after 5 minutes
    setTimeout(() => clearInterval(interval), 300000);
}

/**
 * Update UI to show verification status
 */
function updateVerificationUI() {
    // Update user badge if exists
    const badge = document.getElementById('form-user-badge');
    if (badge && state.hwVerified && !badge.innerHTML.includes('HARDWARE VERIFIED')) {
        badge.innerHTML += ` <span class="hw-badge">🔒 HARDWARE VERIFIED</span>`;
    }
    
    // Enable any disabled buttons
    document.querySelectorAll('.requires-hw').forEach(el => {
        el.classList.remove('disabled');
        el.removeAttribute('disabled');
    });
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
function injectModalHTML() {
    if (document.getElementById('hw-verify-modal')) return;
    
    const div = document.createElement('div');
    div.id = 'hw-verify-modal';
    div.className = 'modal-overlay hidden';
    div.innerHTML = `
        <div class="modal-card" style="text-align:center; max-width:400px; margin:auto; padding:30px;">
            <h2 style="margin-top:0;">🔒 Hardware Verification Required</h2>
            <p style="color:#888;">This action requires a verified Ci5 device.</p>
            <p style="color:#888; font-size:0.9em;">Run this command on your Pi:</p>
            <div style="background:#000; padding:15px; margin:20px 0; border-radius:8px; font-family:'JetBrains Mono', monospace; color:#30d158; font-size:1.1em; cursor:pointer;" onclick="copyVerifyCommand()">
                <span id="verify-command">Loading...</span>
            </div>
            <p style="color:#666; font-size:0.8em;">Click command to copy • Waiting for verification...</p>
            <button onclick="closeVerifyModal()" style="margin-top:15px; padding:10px 20px; background:#333; border:none; color:#fff; border-radius:6px; cursor:pointer;">Cancel</button>
        </div>
    `;
    document.body.appendChild(div);
}

function copyVerifyCommand() {
    const cmd = document.getElementById('verify-command');
    if (cmd) {
        navigator.clipboard.writeText(cmd.textContent);
        cmd.style.color = '#fff';
        setTimeout(() => cmd.style.color = '#30d158', 1000);
    }
}

function closeVerifyModal() {
    const modal = document.getElementById('hw-verify-modal');
    if (modal) modal.classList.add('hidden');
    state.pendingAction = null;
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
        const badge = document.getElementById('form-user-badge');
        
        if (avatar) avatar.src = state.user.avatar_url;
        if (username) username.textContent = state.user.login;
        if (badge) badge.innerHTML = `<img src="${state.user.avatar_url}" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:8px;"> Registry Signer: ${state.user.login}`;
        
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
            signerDisplay.textContent = `MAINTAINER: ${REGISTRY_DATA.meta.signing_authority}`;
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
        }
        
        const submitter = cork.repo ? cork.repo.split('/')[0] : 'unknown';
        
        el.innerHTML = `
            <div class="app-icon">${getIconFor(key)}</div>
            <div class="app-details">
                <div class="app-name">${key}</div>
                <div class="app-cat">${statusDot} ${cork.ram || 'RAM?'} • ${isOfficial ? 'Verified' : 'Community'}</div>
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
    
    toggleModal(true);
}

function toggleModal(show) {
    const el = document.getElementById('modal-overlay');
    if (el) {
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
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

/**
 * Generate cork submission — REQUIRES HARDWARE VERIFICATION
 */
function generateSubmission() {
    requireHardware(() => {
        const name = document.getElementById('sub-name')?.value;
        const repo = document.getElementById('sub-repo')?.value;
        const desc = document.getElementById('sub-desc')?.value;
        const ram = document.getElementById('sub-ram')?.value;
        
        if (!name || !repo) {
            alert('Name and Repo are required.');
            return;
        }
        
        const json = `"${name}": { "repo": "${repo.replace('https://github.com/', '')}", "desc": "${desc}", "ram": "${ram}", "submitter_hwid": "${state.hwid?.substring(0, 8) || 'unverified'}", "signature": null, "audit": null }`;
        
        const title = `New Cork: ${name}`;
        const body = `Please add this Cork to the registry.

\`\`\`json
${json}
\`\`\`

**Submitted by:** @${state.user.login}
**Hardware Verified:** ${state.hwVerified ? `Yes (${state.hwid?.substring(0, 8)}...)` : 'No'}

---
*I confirm this submission is for a valid Ci5-tested container.*`;
        
        window.open(`https://github.com/dreamswag/ci5.dev/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, '_blank');
    });
}

/**
 * Submit cork rating — REQUIRES HARDWARE VERIFICATION
 */
function submitVote() {
    requireHardware(async () => {
        const ram = document.getElementById('vote-ram')?.value;
        const status = document.getElementById('vote-status')?.value;
        const corkName = document.getElementById('modal-title')?.textContent;
        
        // In a real implementation, this would POST to your API
        console.log('Vote submitted:', { cork: corkName, ram, status, hwid: state.hwid });
        alert(`Vote recorded for ${corkName}!\n\nRAM: ${ram}MB\nStatus: ${status}\nHWID: ${state.hwid?.substring(0, 8)}...`);
    });
}

function getIconFor(name) {
    if (name.includes('adguard')) return '🛡️';
    if (name.includes('unbound')) return '🌐';
    if (name.includes('suricata')) return '👁️';
    if (name.includes('minecraft')) return '⛏️';
    if (name.includes('tor')) return '🧅';
    if (name.includes('bitcoin')) return '₿';
    if (name.includes('ntop')) return '📊';
    if (name.includes('pihole')) return '🕳️';
    if (name.includes('wireguard')) return '🔐';
    if (name.includes('nginx')) return '🌐';
    return '📦';
}

function filterGrid(query) {
    if (!query) {
        switchView('official');
        return;
    }
    
    const grid = document.getElementById('main-grid');
    if (!grid || !REGISTRY_DATA) return;
    
    grid.innerHTML = '';
    const all = { ...REGISTRY_DATA.official, ...REGISTRY_DATA.community };
    
    Object.entries(all).forEach(([k, v]) => {
        if (k.toLowerCase().includes(query.toLowerCase()) || 
            v.desc?.toLowerCase().includes(query.toLowerCase())) {
            const isOfficial = !!REGISTRY_DATA.official[k];
            const el = document.createElement('div');
            el.className = 'app-row';
            el.onclick = () => openDetail(k, isOfficial ? 'official' : 'community');
            
            const submitter = v.repo ? v.repo.split('/')[0] : 'unknown';
            el.innerHTML = `
                <div class="app-icon">${getIconFor(k)}</div>
                <div class="app-details">
                    <div class="app-name">${k}</div>
                    <div class="app-cat">${v.ram || 'RAM?'} • ${isOfficial ? 'Verified' : 'Community'}</div>
                    <div class="app-submitter">by ${submitter}</div>
                </div>
                <button class="get-btn">VIEW</button>
            `;
            grid.appendChild(el);
        }
    });
}
