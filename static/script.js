/**
 * CI5.DEV — Cork Registry Frontend
 * ═══════════════════════════════════════════════════════════════════════════
 * Features:
 * - Browse corks (public, no auth required)
 * - Rate corks (requires hardware verification)
 * - Submit corks (requires hardware verification)
 * - GitHub OAuth Device Flow (Styled & Integrated)
 * - Hardware challenge-response verification
 * - Third Party Source Imports
 * - NEW: Cork Cellar (Stacks)
 * - NEW: Mobile Optimized Top Bar
 * * Session Duration: π hours (3.14159... hours ≈ 3h 8m 30s)
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
let currentCorkKey = null;

const state = {
    user: null,
    accessToken: localStorage.getItem('gh_token'),
    deviceInterval: null,
    sessionId: localStorage.getItem('ci5_session') || crypto.randomUUID(),
    hwVerified: false,
    hwid: null,
    pendingAction: null,
    verificationPollInterval: null
};

// Third Party State
const TP_STATE = {
    sources: JSON.parse(localStorage.getItem('ci5_sources') || '[]'),
    data: {} 
};

localStorage.setItem('ci5_session', state.sessionId);

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Core Init
    injectHardwareModal();
    checkAuth();
    checkHardwareVerification();
    renderThirdPartySidebar();
    
    // UI Patches & Fixes
    performUiPatches();
    injectCorkCellarNav();
    setupMobileMenu();
    
    // Data Load
    fetchCorks();
    
    const searchBox = document.getElementById('search-box');
    if (searchBox) {
        searchBox.addEventListener('input', (e) => filterGrid(e.target.value));
    }
});

/**
 * Applies DOM manipulations to fix layout issues without editing HTML directly
 */
function performUiPatches() {
    // 1. Swap 'Run' and 'Dev' in top bar
    const menuLeft = document.querySelector('.menu-left');
    if (menuLeft) {
        const items = Array.from(menuLeft.querySelectorAll('.menu-item'));
        if (items.length >= 3) {
            // Assuming order: [0]=Run, [1]=Host, [2]=Dev
            // We want: Dev, Host, Run
            // Note: items[0] is usually Run based on HTML provided
            const runItem = items[0];
            const devItem = items[2];
            
            // Swap logic
            if (runItem && devItem) {
                runItem.parentNode.insertBefore(devItem, runItem); // Move Dev before Run
                runItem.parentNode.insertBefore(runItem, items[3]); // Move Run to where Dev was (roughly)
                // Re-ordering specifically: Logo, Dev, Host, Run, Network
                // Reference: Logo is logic-group, not menu-item
            }
        }
    }

    // 3. Hero Description Newline
    const heroDesc = document.querySelector('.hero-desc');
    if (heroDesc) {
        // Replace the generic text or format specific part
        const html = heroDesc.innerHTML;
        if (html.includes('Optimised for Pi 5 Leeway')) {
            heroDesc.innerHTML = html.replace('Optimised for Pi 5 Leeway', '<br>Optimised for Pi 5 Leeway');
        }
    }
}

/**
 * 2. Setup Mobile Dropdown Functionality
 */
function setupMobileMenu() {
    const menuItems = document.querySelectorAll('.menu-item');
    
    menuItems.forEach(item => {
        // Prevent default hover issues on mobile by using click
        item.addEventListener('click', (e) => {
            // Only trigger on mobile/tablet widths
            if (window.innerWidth < 1024) {
                const dropdown = item.querySelector('.dropdown');
                if (dropdown) {
                    // Close others
                    document.querySelectorAll('.dropdown').forEach(d => {
                        if (d !== dropdown) d.style.display = 'none';
                    });
                    
                    // Toggle current
                    if (dropdown.style.display === 'flex') {
                        dropdown.style.display = 'none';
                    } else {
                        dropdown.style.display = 'flex';
                        e.preventDefault(); // Prevent immediate navigation if it's a link
                    }
                }
            }
        });
    });

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu-item')) {
            document.querySelectorAll('.dropdown').forEach(d => {
                d.style.display = ''; // Reset to CSS default
            });
        }
    });
}


// ═══════════════════════════════════════════════════════════════════════════
// THIRD PARTY SOURCES
// ═══════════════════════════════════════════════════════════════════════════

function openAddSourceModal() {
    document.getElementById('add-source-modal').classList.remove('hidden');
    document.getElementById('new-source-url').focus();
}

function closeAddSourceModal() {
    document.getElementById('add-source-modal').classList.add('hidden');
}

async function submitAddSource() {
    const url = document.getElementById('new-source-url').value.trim();
    const name = document.getElementById('new-source-name').value.trim();
    
    if (!url) return alert('URL is required');
    
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch source');
        const json = await res.json();
        
        if (!json.corks && !Array.isArray(json)) throw new Error('Invalid cork list format');
        
        const sourceId = 'tp_' + Date.now().toString(36);
        const sourceName = name || json.name || 'Unknown Source';
        
        TP_STATE.sources.push({
            id: sourceId,
            url: url,
            name: sourceName,
            enabled: true
        });
        
        localStorage.setItem('ci5_sources', JSON.stringify(TP_STATE.sources));
        
        closeAddSourceModal();
        renderThirdPartySidebar();
        await fetchCorks(); 
        
    } catch (e) {
        alert('Error adding source: ' + e.message);
    }
}

function removeSource(id, event) {
    if (event) event.stopPropagation();
    if (!confirm('Remove this source?')) return;
    
    TP_STATE.sources = TP_STATE.sources.filter(s => s.id !== id);
    localStorage.setItem('ci5_sources', JSON.stringify(TP_STATE.sources));
    
    renderThirdPartySidebar();
    fetchCorks();
    switchView('official');
}

function renderThirdPartySidebar() {
    const list = document.getElementById('tp-sources-list');
    if(!list) return;
    list.innerHTML = '';
    
    TP_STATE.sources.forEach(src => {
        const el = document.createElement('div');
        el.className = 'nav-item';
        el.style.display = 'flex';
        el.style.justifyContent = 'space-between';
        
        el.onclick = function(e) { 
             if (e.target.className !== 'sidebar-del-btn') switchView(src.id, el);
        };
        
        el.innerHTML = `
            <span>${src.name}</span>
            <span class="sidebar-del-btn" onclick="removeSource('${src.id}', event)">×</span>
        `;
        list.appendChild(el);
    });
}

async function fetchThirdPartyData() {
    TP_STATE.data = {};
    const promises = TP_STATE.sources.map(async (src) => {
        try {
            const res = await fetch(src.url);
            const json = await res.json();
            const corksList = Array.isArray(json) ? json : json.corks;
            
            const normalized = {};
            corksList.forEach(c => {
                normalized[c.id] = {
                    repo: c.author || new URL(src.url).hostname,
                    desc: c.description || 'No description',
                    ram: '?',
                    custom_install: c.install || `ci5 cork install --source ${src.url} ${c.id}`,
                    is_third_party: true,
                    source_name: src.name
                };
            });
            TP_STATE.data[src.id] = normalized;
        } catch (e) {
            console.error(`Failed to load source ${src.name}`, e);
        }
    });
    await Promise.allSettled(promises);
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHING & RENDERING
// ═══════════════════════════════════════════════════════════════════════════

async function fetchCorks() {
    try {
        const response = await fetch('corks.json');
        if (!response.ok) throw new Error('Manifest missing');
        
        REGISTRY_DATA = await response.json();
        
        // Mock Cellar Data (Since it's not in JSON yet)
        REGISTRY_DATA.cellar = {
            "privacy-stack": {
                repo: "stacks/privacy",
                desc: "Tor Relay + PiHole + Unbound combo pack.",
                ram: "1GB",
                audit: { audit_result: "SAFE" }
            },
            "monitoring-stack": {
                repo: "stacks/monitor",
                desc: "Grafana + Prometheus + NodeExporter.",
                ram: "512MB",
                audit: { audit_result: "SAFE" }
            }
        };
        
        await fetchThirdPartyData();
        
        REGISTRY_DATA.third_party_merged = {};
        Object.values(TP_STATE.data).forEach(sourceData => {
            Object.assign(REGISTRY_DATA.third_party_merged, sourceData);
        });

        const signerDisplay = document.getElementById('signer-display');
        if (signerDisplay && REGISTRY_DATA.meta) {
            signerDisplay.textContent = `AUTH: ${REGISTRY_DATA.meta.signing_authority}`;
        }
        
        const active = document.querySelector('.nav-item.active');
        if (!active) switchView('official');
        
    } catch (e) {
        console.error('Failed to load corks:', e);
        const signerDisplay = document.getElementById('signer-display');
        if (signerDisplay) signerDisplay.textContent = 'OFFLINE MODE';
    }
}

function switchView(viewName, element) {
    if (viewName === 'submit' && !state.user) {
        startDeviceAuth();
        return;
    }
    
    const browser = document.getElementById('browser-view');
    const submission = document.getElementById('submission-view');
    const header = document.getElementById('section-header');
    const hero = document.getElementById('hero-card');
    
    if (element) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
    }
    
    if (browser) browser.classList.remove('hidden');
    if (submission) submission.classList.add('hidden');
    
    if (viewName === 'submit') {
        if (browser) browser.classList.add('hidden');
        if (submission) submission.classList.remove('hidden');
        return;
    }
    
    const grid = document.getElementById('main-grid');
    if (grid) grid.innerHTML = '';
    
    if (!REGISTRY_DATA) return;
    
    if (viewName.startsWith('tp_')) {
        const src = TP_STATE.sources.find(s => s.id === viewName);
        if (header) header.textContent = `📦 ${src ? src.name : 'Unknown Source'}`;
        if (hero) hero.classList.add('hidden');
        renderRows(TP_STATE.data[viewName] || {}, false, true);
        return;
    }

    switch (viewName) {
        case 'official':
            if (header) header.textContent = '🃏 ci5-canon-corks';
            if (hero) hero.classList.remove('hidden');
            renderRows(REGISTRY_DATA.official, true);
            break;
        case 'community':
            if (header) header.textContent = '🛸 Recently Deployed Corks';
            if (hero) hero.classList.add('hidden');
            renderRows(REGISTRY_DATA.community, false);
            break;
        case 'top':
            if (header) header.textContent = '⚗️ User Favourite Corks';
            if (hero) hero.classList.add('hidden');
            renderRows(REGISTRY_DATA.community, false);
            break;
        case 'cellar':
            if (header) header.textContent = '🍷 Cork Cellar (Stacks)';
            if (hero) hero.classList.add('hidden');
            renderRows(REGISTRY_DATA.cellar || {}, false);
            break;
    }
}

function renderRows(corksObj, isOfficial, isThirdParty = false) {
    const grid = document.getElementById('main-grid');
    if (!grid || !corksObj) return;
    
    if (Object.keys(corksObj).length === 0) {
        grid.innerHTML = '<div class="no-results">No corks available.</div>';
        return;
    }

    Object.entries(corksObj).forEach(([key, cork]) => {
        const el = document.createElement('div');
        el.className = 'app-row';
        
        let type = isOfficial ? 'official' : 'community';
        if (isThirdParty) type = 'third_party';
        
        el.onclick = () => openDetail(key, type, cork); 
        
        // 5. Fix for Green Lights (Status Dots)
        let statusDot = '<span class="status-dot dot-unknown"></span>';
        let subText = isOfficial ? 'Signed' : 'Community';
        
        if (isThirdParty) {
            statusDot = '<span class="status-dot" style="background:#a855f7"></span>'; // Purple
            subText = 'Imported';
        } else if (cork.audit?.audit_result === 'SAFE') {
            statusDot = '<span class="status-dot dot-safe"></span>';
        } else if (cork.audit?.audit_result === 'SUSPICIOUS') {
            statusDot = '<span class="status-dot" style="background:#ff9f0a"></span>'; // Orange
        } else if (cork.audit?.audit_result === 'MALICIOUS') {
            statusDot = '<span class="status-dot" style="background:#ff453a"></span>'; // Red
        } else if (!isOfficial && !isThirdParty) {
            // FIX: Default Community apps to Green if no explicit audit is present (User Request)
            statusDot = '<span class="status-dot dot-safe"></span>';
        }
        
        const submitter = cork.repo ? cork.repo.split('/')[0] : 'unknown';
        
        el.innerHTML = `
            <div class="app-icon">${getIconFor(key)}</div>
            <div class="app-details">
                <div class="app-name">${key}</div>
                <div class="app-cat">${statusDot} ${cork.ram || 'RAM?'} • ${subText}</div>
                <div class="app-submitter">by ${submitter}</div>
            </div>
            <button class="get-btn">VIEW</button>
        `;
        grid.appendChild(el);
    });
}

function openDetail(key, type, corkObj = null) {
    let cork = corkObj;
    if (!cork) {
        cork = REGISTRY_DATA?.official?.[key] || REGISTRY_DATA?.community?.[key] || REGISTRY_DATA?.cellar?.[key] || REGISTRY_DATA?.third_party_merged?.[key];
    }
    
    if (!cork) return;
    
    currentCorkKey = key;
    
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
    
    if (cork.custom_install) {
        if (modalCmd) modalCmd.textContent = cork.custom_install;
    } else {
        if (modalCmd) modalCmd.textContent = `ci5 install ${key}`;
    }

    if (modalSource) modalSource.href = cork.repo.startsWith('http') ? cork.repo : `https://github.com/${cork.repo}`;
    if (modalSubmitter) modalSubmitter.textContent = `by ${cork.repo.startsWith('http') ? 'external' : cork.repo.split('/')[0]}`;
    
    if (modalTag) {
        if (type === 'official') {
            modalTag.textContent = 'OFFICIAL SIGNED';
            modalTag.style.color = '#30d158';
            modalTag.style.borderColor = '#30d158';
        } else if (type === 'third_party') {
            modalTag.textContent = 'THIRD PARTY';
            modalTag.style.color = '#a855f7';
            modalTag.style.borderColor = '#a855f7';
        } else {
            modalTag.textContent = 'COMMUNITY';
            modalTag.style.color = '#ff9f0a';
            modalTag.style.borderColor = '#ff9f0a';
        }
    }
    
    updateTelemetryButton();
    loadCommunitySignal(key);
    toggleModal(true);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION & LOGIN UI (4. Visual Overhaul)
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
            logout(true);
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
        const res = await fetch('https://corsproxy.io/?' + encodeURIComponent(CONFIG.api.deviceCode), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ client_id: CONFIG.clientId, scope: 'public_repo' })
        });
        const data = await res.json();
        
        if (data.device_code) {
            if (loading) loading.classList.add('hidden');
            if (codeSec) codeSec.classList.remove('hidden');
            
            // 4. Enhanced Visuals for Login Code (Matches .network style)
            const codeDisplay = document.getElementById('user-code');
            if (codeDisplay) {
                // Clear default text and use HTML injection for the styled box
                const container = codeSec;
                container.innerHTML = `
                    <p class="desc-text" style="text-align:center; margin-bottom: 20px;">
                        Enter this code at <br>
                        <a href="https://github.com/login/device" target="_blank" style="color:#30d158; text-decoration:none; font-weight:bold;">github.com/login/device</a>
                    </p>
                    
                    <div class="install-box" style="cursor:pointer; margin: 0 auto; max-width: 280px;" onclick="navigator.clipboard.writeText('${data.user_code}'); this.querySelector('code').style.color='#fff'; setTimeout(()=>this.querySelector('code').style.color='#30d158', 500);">
                        <div class="install-label" style="text-align:center;">CLICK TO COPY</div>
                        <code style="font-size: 24px; text-align: center; color: #30d158; border-color: #30d158; padding: 15px; letter-spacing: 2px;">${data.user_code}</code>
                    </div>
                    
                    <div class="auth-status" style="margin-top:25px; text-align:center;">
                        <span class="spinner-small"></span> Waiting for authorization...
                    </div>
                `;
            }
            pollForToken(data.device_code, data.interval || 5);
        }
    } catch (e) {
        console.error('Device auth failed:', e);
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
            }
        } catch (e) {}
    }, (interval + 1) * 1000);
}

function closeAuthModal() {
    document.getElementById('auth-overlay')?.classList.add('hidden');
    if (state.deviceInterval) clearInterval(state.deviceInterval);
}

function logout(silent) {
    if (!silent && !confirm('Disconnect?')) return;
    state.user = null; state.accessToken = null; state.hwVerified = false;
    localStorage.removeItem('gh_token');
    updateAuthUI();
    switchView('official');
}

// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

async function checkHardwareVerification() {
    try {
        const res = await fetch(`${CI5_API}/v1/identity/check?session=${state.sessionId}`);
        const data = await res.json();
        if (data.verified) {
            state.hwVerified = true;
            state.hwid = data.hwid;
            updateVerificationUI();
        }
    } catch (e) {}
}

async function requestHardwareVerification() {
    const challenge = 'ci5_' + Math.random().toString(36).substring(2, 8);
    try {
        const res = await fetch(`${CI5_API}/v1/challenge/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                challenge,
                session_id: state.sessionId,
                expires: Date.now() + 300000 
            })
        });
        if (!res.ok) throw new Error('Failed');
        showHardwareModal(challenge);
        pollForVerification();
    } catch (e) {
        alert('Verification service unavailable.');
    }
}

function showHardwareModal(challenge) { 
    document.getElementById('hw-verify-command').textContent = `ci5 verify ${challenge}`;
    document.getElementById('hw-verify-modal').classList.remove('hidden');
}

function closeHardwareModal() { 
    document.getElementById('hw-verify-modal')?.classList.add('hidden'); 
    if (state.verificationPollInterval) clearInterval(state.verificationPollInterval);
}

function copyHardwareCommand() { 
    const cmd = document.getElementById('hw-verify-command');
    if (cmd) {
        navigator.clipboard.writeText(cmd.textContent);
        cmd.style.color = '#fff';
        setTimeout(() => cmd.style.color = '#30d158', 500);
    }
}

function pollForVerification() {
    if (state.verificationPollInterval) clearInterval(state.verificationPollInterval);
    state.verificationPollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${CI5_API}/v1/identity/check?session=${state.sessionId}`);
            const data = await res.json();
            if (data.verified) {
                clearInterval(state.verificationPollInterval);
                state.hwVerified = true;
                state.hwid = data.hwid;
                closeHardwareModal();
                updateVerificationUI();
                if (state.pendingAction) {
                    const action = state.pendingAction;
                    state.pendingAction = null;
                    action();
                }
            }
        } catch (e) {}
    }, 2000);
}

function updateVerificationUI() {
    const badge = document.getElementById('form-user-badge');
    if (badge && state.user) {
        const hwStatus = state.hwVerified 
            ? `<span class="hw-verified-badge">🔒 VERIFIED</span>`
            : `<span class="hw-unverified-badge">⚠️ UNVERIFIED</span>`;
        badge.innerHTML = `<img src="${state.user.avatar_url}" alt="" class="badge-avatar"> ${state.user.login} ${hwStatus}`;
    }
    updateTelemetryButton();
}

function requireHardware(action) {
    if (!state.user) { startDeviceAuth(); return; }
    if (state.hwVerified) { action(); return; }
    state.pendingAction = action;
    requestHardwareVerification();
}

function injectHardwareModal() {
    if (document.getElementById('hw-verify-modal')) return;
    const div = document.createElement('div');
    div.id = 'hw-verify-modal';
    div.className = 'modal-overlay hidden';
    div.innerHTML = `<div class="modal-window" style="max-width:420px;"><div class="modal-header"><div class="app-icon large">🔒</div><div class="modal-title-group"><h2>Hardware Verification</h2><span class="signer-tag" style="color:#ff9f0a; border-color:#ff9f0a;">CI5-ASH REQUIRED</span></div><button class="close-btn" onclick="closeHardwareModal()">×</button></div><div class="modal-body" style="text-align:center;"><p class="desc-text">This action requires a verified Ci5 device.</p><div class="install-box" style="cursor:pointer;" onclick="copyHardwareCommand()"><div class="install-label">VERIFICATION COMMAND</div><code id="hw-verify-command" style="font-size:1.1em;">ci5 verify ...</code></div><div class="auth-status" style="margin-top:20px;"><span class="spinner-small"></span> Waiting...</div></div></div>`;
    document.body.appendChild(div);
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILS & ACTION HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

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

async function loadCommunitySignal(key) {
    const box = document.getElementById('community-ram-box');
    if (box) box.innerHTML = `<div class="stat-label">COMMUNITY AVG</div><div class="stat-val">—</div><div class="stat-sub">No signals</div>`;
}

function toggleModal(show) {
    const el = document.getElementById('modal-overlay');
    if (show) el.classList.remove('hidden');
    else { el.classList.add('hidden'); currentCorkKey = null; }
}

function closeModal(e) { if (e.target.id === 'modal-overlay') toggleModal(false); }

function copyCmd(el) { 
    navigator.clipboard.writeText(el.textContent);
    const orig = el.textContent;
    el.textContent = 'COPIED';
    el.style.color = '#fff';
    setTimeout(() => { el.textContent = orig; el.style.color = '#30d158'; }, 1000);
}

function generateSubmission() {
    requireHardware(() => {
        const name = document.getElementById('sub-name')?.value;
        const repo = document.getElementById('sub-repo')?.value;
        if (!name || !repo) return alert('Details required');
        const body = `New submission: ${name} (${repo}) by ${state.user.login} (HWID: ${state.hwid})`;
        window.open(`https://github.com/dreamswag/ci5.dev/issues/new?title=Cork:${name}&body=${encodeURIComponent(body)}`);
    });
}

function submitVote() {
    requireHardware(() => {
        const ram = document.getElementById('vote-ram')?.value;
        alert(`Signal sent for ${currentCorkKey}: ${ram}MB (Verified: ${state.hwid})`);
    });
}

function getIconFor(name) {
    const icons = { 'adguard':'🛡️', 'unbound':'🌐', 'suricata':'👁️', 'crowdsec':'🤖', 'minecraft':'⛏️', 'tor':'🧅', 'bitcoin':'₿', 'ethereum':'Ξ', 'monero':'🔒', 'ntop':'📊', 'pihole':'🕳️', 'wireguard':'🔐', 'home-assistant':'🏠', 'nginx':'🌐', 'paper':'📄', 'stack':'📚' };
    for (const [k, v] of Object.entries(icons)) if (name.toLowerCase().includes(k)) return v;
    return '📦';
}

function filterGrid(query) {
    if (!query) { switchView('official'); return; }
    const grid = document.getElementById('main-grid');
    grid.innerHTML = '';
    const all = { ...REGISTRY_DATA.official, ...REGISTRY_DATA.community, ...REGISTRY_DATA.cellar, ...REGISTRY_DATA.third_party_merged };
    
    let count = 0;
    Object.entries(all).forEach(([k, v]) => {
        if (k.toLowerCase().includes(query.toLowerCase())) {
            count++;
            const type = REGISTRY_DATA.official[k] ? 'official' : 'community';
            const el = document.createElement('div');
            el.className = 'app-row';
            el.onclick = () => openDetail(k, type, v);
            el.innerHTML = `<div class="app-icon">${getIconFor(k)}</div><div class="app-details"><div class="app-name">${k}</div><div class="app-cat">${v.ram} • ${type}</div></div><button class="get-btn">VIEW</button>`;
            grid.appendChild(el);
        }
    });
    if (count === 0) grid.innerHTML = '<div class="no-results">No matches.</div>';
}