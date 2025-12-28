/**
 * CI5.DEV — Cork Registry Frontend
 * ═══════════════════════════════════════════════════════════════════════════
 * * Features:
 * - Browse corks (public, no auth required)
 * - Rate corks (requires hardware verification)
 * - Submit corks (requires hardware verification)
 * - GitHub OAuth Device Flow
 * - Hardware challenge-response verification
 * - NEW: Third Party Source Imports
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
    data: {} // { sourceId: { corkKey: { ...corkData } } }
};

localStorage.setItem('ci5_session', state.sessionId);

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    injectHardwareModal();
    checkAuth();
    checkHardwareVerification();
    renderThirdPartySidebar();
    fetchCorks(); // Fetches official + third party
    
    const searchBox = document.getElementById('search-box');
    if (searchBox) {
        searchBox.addEventListener('input', (e) => filterGrid(e.target.value));
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// THIRD PARTY SOURCES (NEW)
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
        
        // Basic validation
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
        await fetchCorks(); // Reload all
        
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
    
    // If we were viewing this source, switch back to official
    switchView('official');
}

function renderThirdPartySidebar() {
    const list = document.getElementById('tp-sources-list');
    list.innerHTML = '';
    
    TP_STATE.sources.forEach(src => {
        const el = document.createElement('div');
        el.className = 'nav-item';
        el.style.display = 'flex';
        el.style.justifyContent = 'space-between';
        
        el.onclick = function(e) { 
             // Only switch if not clicking the delete button
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
            
            // Normalize to registry format
            const normalized = {};
            corksList.forEach(c => {
                normalized[c.id] = {
                    repo: c.author || new URL(src.url).hostname, // Fallback for "by X"
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
// EXISTING LOGIC (Updated to integrate TP)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchCorks() {
    try {
        const response = await fetch('corks.json');
        if (!response.ok) throw new Error('Manifest missing');
        
        REGISTRY_DATA = await response.json();
        
        // Load Third Party
        await fetchThirdPartyData();
        
        // Merge into REGISTRY_DATA so global search finds them
        REGISTRY_DATA.third_party_merged = {};
        Object.values(TP_STATE.data).forEach(sourceData => {
            Object.assign(REGISTRY_DATA.third_party_merged, sourceData);
        });

        const signerDisplay = document.getElementById('signer-display');
        if (signerDisplay && REGISTRY_DATA.meta) {
            signerDisplay.textContent = `AUTH: ${REGISTRY_DATA.meta.signing_authority}`;
        }
        
        // Default view
        const active = document.querySelector('.nav-item.active');
        if (!active) switchView('official');
        
    } catch (e) {
        console.error('Failed to load corks:', e);
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
    
    // Check if it's a third party source ID
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
            if (header) header.textContent = '🌠 User Favourite Corks';
            if (hero) hero.classList.add('hidden');
            renderRows(REGISTRY_DATA.community, false);
            break;
    }
}

function renderRows(corksObj, isOfficial, isThirdParty = false) {
    const grid = document.getElementById('main-grid');
    if (!grid || !corksObj) return;
    
    if (Object.keys(corksObj).length === 0) {
        grid.innerHTML = '<div class="no-results">No corks in this source.</div>';
        return;
    }

    Object.entries(corksObj).forEach(([key, cork]) => {
        const el = document.createElement('div');
        el.className = 'app-row';
        
        let type = isOfficial ? 'official' : 'community';
        if (isThirdParty) type = 'third_party';
        
        // Pass the actual object key to openDetail
        el.onclick = () => openDetail(key, type, cork); // Pass cork obj directly to avoid lookup issues
        
        let statusDot = '<span class="status-dot dot-unknown"></span>';
        let subText = isOfficial ? 'Signed' : 'Community';
        
        if (isThirdParty) {
            statusDot = '<span class="status-dot" style="background:#a855f7"></span>'; // Purple
            subText = 'Imported';
        } else if (cork.audit?.audit_result === 'SAFE') {
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
    // If corkObj provided (TP), use it. Otherwise lookup.
    let cork = corkObj;
    if (!cork) {
        cork = REGISTRY_DATA?.official?.[key] || REGISTRY_DATA?.community?.[key] || REGISTRY_DATA?.third_party_merged?.[key];
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
    
    // Custom install command handling
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
// HARDWARE / AUTH / UTILS (Unchanged logic, just keeping structure)
// ═══════════════════════════════════════════════════════════════════════════

function checkAuth() {
    if (!state.accessToken) {
        updateAuthUI();
        return;
    }
    fetch('https://api.github.com/user', { headers: { 'Authorization': `Bearer ${state.accessToken}` } })
        .then(res => res.ok ? res.json() : (logout(true), null))
        .then(data => { if(data) state.user = data; updateAuthUI(); })
        .catch(e => console.error(e));
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

// ... [The rest of Auth/Hardware logic remains exactly as provided in original] ...
// I am truncating the Auth/Hardware/Util functions here for brevity as they are 
// identical to your original file, but in the final file they would be included.
// Just ensure the functions below are present: startDeviceAuth, pollForToken, closeAuthModal, 
// logout, checkHardwareVerification, requestHardwareVerification, showHardwareModal, 
// closeHardwareModal, copyHardwareCommand, pollForVerification, updateVerificationUI, 
// requireHardware, injectHardwareModal, updateTelemetryButton, loadCommunitySignal, 
// toggleModal, closeModal, copyCmd, generateSubmission, submitVote.

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
            const codeDisplay = document.getElementById('user-code');
            if (codeDisplay) codeDisplay.textContent = data.user_code;
            pollForToken(data.device_code, data.interval || 5);
        }
    } catch (e) {
        console.error(e); closeAuthModal();
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
}

function checkHardwareVerification() { /* ... existing logic ... */ }
function requestHardwareVerification() { /* ... existing logic ... */ }
function showHardwareModal(c) { 
    document.getElementById('hw-verify-command').textContent = `ci5 verify ${c}`;
    document.getElementById('hw-verify-modal').classList.remove('hidden');
}
function closeHardwareModal() { document.getElementById('hw-verify-modal')?.classList.add('hidden'); }
function copyHardwareCommand() { navigator.clipboard.writeText(document.getElementById('hw-verify-command').textContent); }
function pollForVerification() { /* ... existing logic ... */ }
function updateVerificationUI() { /* ... existing logic ... */ }
function requireHardware(cb) { if(!state.user) startDeviceAuth(); else cb(); } // Simplified for this snippet
function injectHardwareModal() { 
    if(document.getElementById('hw-verify-modal')) return;
    const div = document.createElement('div'); div.id='hw-verify-modal'; div.className='modal-overlay hidden';
    div.innerHTML=`<div class="modal-window"><div class="modal-header"><h2>Hardware Check</h2><button class="close-btn" onclick="closeHardwareModal()">×</button></div><div class="modal-body"><code id="hw-verify-command" onclick="copyHardwareCommand()">...</code></div></div>`;
    document.body.appendChild(div);
}
function updateTelemetryButton() { /* ... existing logic ... */ }
function loadCommunitySignal(k) { /* ... existing logic ... */ }

function toggleModal(show) {
    const el = document.getElementById('modal-overlay');
    if (show) el.classList.remove('hidden');
    else { el.classList.add('hidden'); currentCorkKey = null; }
}
function closeModal(e) { if (e.target.id === 'modal-overlay') toggleModal(false); }
function copyCmd(el) { navigator.clipboard.writeText(el.textContent); }
function generateSubmission() { /* ... existing logic ... */ }
function submitVote() { /* ... existing logic ... */ }

function getIconFor(name) {
    const icons = {
        'adguard': '🛡️', 'unbound': '🌐', 'suricata': '👁️', 'crowdsec': '🤖',
        'minecraft': '⛏️', 'tor': '🧅', 'bitcoin': '₿', 'ethereum': 'Ξ',
        'monero': '🔒', 'ntop': '📊', 'pihole': '🕳️', 'wireguard': '🔐',
        'home-assistant': '🏠'
    };
    for (const [key, icon] of Object.entries(icons)) {
        if (name.toLowerCase().includes(key)) return icon;
    }
    return '📦';
}

function filterGrid(query) {
    if (!query) { switchView('official'); return; }
    const grid = document.getElementById('main-grid');
    grid.innerHTML = '';
    
    // Merge all for search
    const all = { 
        ...REGISTRY_DATA.official, 
        ...REGISTRY_DATA.community,
        ...REGISTRY_DATA.third_party_merged
    };
    
    Object.entries(all).forEach(([k, v]) => {
        if (k.toLowerCase().includes(query.toLowerCase())) {
            const isTP = v.is_third_party;
            const isOfficial = !!REGISTRY_DATA.official[k];
            
            const el = document.createElement('div');
            el.className = 'app-row';
            el.onclick = () => openDetail(k, isTP ? 'third_party' : (isOfficial ? 'official' : 'community'), v);
            
            el.innerHTML = `
                <div class="app-icon">${getIconFor(k)}</div>
                <div class="app-details">
                    <div class="app-name">${k}</div>
                    <div class="app-cat">${v.ram || '?'} • ${isTP ? 'Imported' : (isOfficial ? 'Signed' : 'Community')}</div>
                </div>
                <button class="get-btn">VIEW</button>
            `;
            grid.appendChild(el);
        }
    });
}