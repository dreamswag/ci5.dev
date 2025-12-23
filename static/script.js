let REGISTRY_DATA = null;
const TELEMETRY_REPO = "dreamswag/ci5"; // The repo where voting threads live

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 60000);
    fetchCorks();
    
    // Search Listener
    document.getElementById('search-box').addEventListener('input', (e) => {
        filterGrid(e.target.value);
    });
});

function updateClock() {
    const now = new Date();
    const opts = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
    document.getElementById('clock-display').innerText = now.toLocaleDateString('en-GB', opts);
}

async function fetchCorks() {
    try {
        const response = await fetch('corks.json');
        if (!response.ok) throw new Error("Manifest Missing");
        REGISTRY_DATA = await response.json();
        
        // Update Meta
        if (document.getElementById('signer-display')) {
            document.getElementById('signer-display').innerText = `AUTH: ${REGISTRY_DATA.meta.signing_authority}`;
        }
        
        // Initial Render (Official)
        switchView('official');
        
    } catch (error) {
        console.error(error);
        if (document.getElementById('signer-display')) {
            document.getElementById('signer-display').innerText = "OFFLINE MODE";
        }
    }
}

// VIEW CONTROLLER
function switchView(viewName) {
    const browser = document.getElementById('browser-view');
    const submission = document.getElementById('submission-view');
    const grid = document.getElementById('main-grid');
    const header = document.getElementById('section-header');
    const hero = document.getElementById('hero-card');

    // Reset UI
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    if (viewName === 'submit') {
        browser.classList.add('hidden');
        submission.classList.remove('hidden');
        return;
    }

    // Browser Mode
    submission.classList.add('hidden');
    browser.classList.remove('hidden');
    grid.innerHTML = '';

    if (viewName === 'official') {
        header.innerText = "🛡️ Verified Official";
        hero.classList.remove('hidden');
        renderRows(REGISTRY_DATA.official, true);
    } else if (viewName === 'community') {
        header.innerText = "🌍 Community Labs";
        hero.classList.add('hidden');
        renderRows(REGISTRY_DATA.community, false);
    } else if (viewName === 'top') {
        header.innerText = "🏆 Top Charts (By Stability)";
        hero.classList.add('hidden');
        const all = { ...REGISTRY_DATA.official, ...REGISTRY_DATA.community };
        renderRows(all, false); 
    } else if (viewName === 'cats') {
        header.innerText = "📂 All Categories";
        hero.classList.add('hidden');
        const all = { ...REGISTRY_DATA.official, ...REGISTRY_DATA.community };
        renderRows(all, false);
    }
}

function renderRows(corksObj, isOfficial) {
    const grid = document.getElementById('main-grid');
    
    Object.entries(corksObj).forEach(([key, cork]) => {
        const el = document.createElement('div');
        el.className = 'app-row';
        el.onclick = () => openDetail(key, isOfficial ? 'official' : 'community'); // Click Row -> Open Modal
        
        let statusDot = '<span class="status-dot dot-suspicious"></span>';
        if (cork.audit && cork.audit.audit_result === 'SAFE') {
            statusDot = '<span class="status-dot dot-safe"></span>';
        }

        const iconChar = getIconFor(key);

        el.innerHTML = `
            <div class="app-icon">${iconChar}</div>
            <div class="app-details">
                <div class="app-name">${key}</div>
                <div class="app-cat">
                    ${statusDot} ${cork.ram || 'RAM?'} • ${isOfficial ? 'Verified' : 'Community'}
                </div>
            </div>
            <button class="get-btn">VIEW</button>
        `;
        grid.appendChild(el);
    });
}

// --- MODAL & TELEMETRY LOGIC ---

function openDetail(key, type) {
    let cork = null;
    if(REGISTRY_DATA.official[key]) cork = REGISTRY_DATA.official[key];
    else if(REGISTRY_DATA.community[key]) cork = REGISTRY_DATA.community[key];
    
    if(!cork) return;

    // Populate Basic Info
    document.getElementById('modal-title').innerText = key;
    document.getElementById('modal-desc').innerText = cork.desc;
    document.getElementById('modal-ram').innerText = cork.ram || "Unknown";
    document.getElementById('modal-icon').innerText = getIconFor(key);
    document.getElementById('modal-cmd').innerText = `ci5 install ${key}`;
    document.getElementById('modal-source').href = `https://github.com/${cork.repo}`;
    
    // Aesthetic Updates
    const tag = document.getElementById('modal-tag');
    tag.innerText = type === 'official' ? "OFFICIAL SIGNED" : "COMMUNITY";
    tag.style.color = type === 'official' ? "#30d158" : "#ff9f0a";
    tag.style.borderColor = type === 'official' ? "#30d158" : "#ff9f0a";

    // Trigger Telemetry Lookup
    loadDynamicTelemetry(key);

    toggleModal(true);
}

async function loadDynamicTelemetry(corkID) {
    const box = document.getElementById('community-ram-box');
    const btn = document.getElementById('telemetry-action-btn');
    
    // Reset UI to "Loading" State
    box.innerHTML = '<span style="animation: blink 1s infinite">SEARCHING SIGNAL...</span>';
    btn.onclick = null; 
    btn.innerText = "LOADING...";

    try {
        // Search for issue named "TELEMETRY: [corkID]"
        const query = `repo:${TELEMETRY_REPO} is:issue in:title "TELEMETRY: ${corkID}"`;
        const searchReq = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}`);
        const searchData = await searchReq.json();

        if (searchData.total_count > 0) {
            // Found it
            const issue = searchData.items[0];
            fetchStatsFromComments(issue.number, issue.html_url);
        } else {
            // Not found
            box.innerHTML = '<span style="color:#888">NO DATA SIGNAL</span>';
            setupTelemetryButton(corkID, null, false);
        }
    } catch (e) {
        console.error(e);
        box.innerHTML = '<span style="color:#ff453a">CONNECTION LOST</span>';
        btn.innerText = "OFFLINE";
    }
}

async function fetchStatsFromComments(issueNumber, issueUrl) {
    const box = document.getElementById('community-ram-box');
    
    const commentsReq = await fetch(`https://api.github.com/repos/${TELEMETRY_REPO}/issues/${issueNumber}/comments`);
    const comments = await commentsReq.json();

    let totalRam = 0;
    let count = 0;
    let works = 0;
    let broken = 0;

    comments.forEach(c => {
        const text = c.body.toUpperCase();
        if (text.includes('[TELEMETRY]')) {
            const ramMatch = text.match(/RAM:(\d+)/);
            if (ramMatch) { totalRam += parseInt(ramMatch[1]); count++; }
            if (text.includes('STATUS:OK')) works++;
            if (text.includes('STATUS:FAIL')) broken++;
        }
    });

    if (count === 0) {
        box.innerHTML = '<span style="color:#888">AWAITING FIRST REPORT</span>';
    } else {
        const avgRam = Math.round(totalRam / count);
        const reliability = Math.round((works / (works + broken)) * 100);
        
        box.innerHTML = `
            <div class="telemetry-grid">
                <div class="t-col"><div class="t-lbl">USAGE</div><div class="t-val">${avgRam}MB</div></div>
                <div class="t-col"><div class="t-lbl">STABILITY</div><div class="t-val" style="color:${reliability > 80 ? '#30d158' : '#ff453a'}">${reliability}%</div></div>
                <div class="t-col"><div class="t-lbl">REPORTS</div><div class="t-val">${count}</div></div>
            </div>
        `;
    }

    setupTelemetryButton(null, issueUrl, true);
}

function setupTelemetryButton(corkID, issueUrl, exists) {
    const btn = document.getElementById('telemetry-action-btn');
    const ramInput = document.getElementById('vote-ram');
    const statusInput = document.getElementById('vote-status');

    if (exists) {
        btn.innerText = "TRANSMIT DATA";
        btn.onclick = () => {
            const body = `[TELEMETRY] RAM:${ramInput.value} STATUS:${statusInput.value}`;
            window.open(`${issueUrl}#new_comment_field?body=${encodeURIComponent(body)}`, '_blank');
        };
    } else {
        btn.innerText = "INITIALIZE THREAD";
        btn.onclick = () => {
            const title = `TELEMETRY: ${corkID}`;
            const body = `Automated Telemetry Thread for ${corkID}.\n\nPost reports in format: \`[TELEMETRY] RAM:128 STATUS:OK\``;
            window.open(`https://github.com/${TELEMETRY_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, '_blank');
        };
    }
}

function toggleModal(show) {
    const el = document.getElementById('modal-overlay');
    if(show) el.classList.remove('hidden');
    else el.classList.add('hidden');
}

function closeModal(e) {
    if(e.target.id === 'modal-overlay') toggleModal(false);
}

function copyCmd(el) {
    navigator.clipboard.writeText(el.innerText);
    const original = el.innerText;
    el.innerText = "COPIED TO CLIPBOARD";
    el.style.color = "#fff";
    setTimeout(() => {
        el.innerText = original;
        el.style.color = "#30d158";
    }, 1500);
}

// SUBMISSION LOGIC
function generateSubmission() {
    const name = document.getElementById('sub-name').value;
    const repo = document.getElementById('sub-repo').value;
    const desc = document.getElementById('sub-desc').value;
    const ram = document.getElementById('sub-ram').value;

    if(!name || !repo) {
        alert("Name and Repo are required.");
        return;
    }

    const json = `
    "${name}": {
      "repo": "${repo.replace('https://github.com/', '')}",
      "desc": "${desc}",
      "ram": "${ram}",
      "signature": null,
      "audit": null
    }`;

    const title = `New Cork: ${name}`;
    const body = `Please add this Cork to the registry:\n\n\`\`\`json${json}\n\`\`\``;
    
    window.open(`https://github.com/dreamswag/ci5.dev/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, '_blank');
}

function getIconFor(name) {
    if(name.includes('adguard')) return '🛡️';
    if(name.includes('unbound')) return '🌐';
    if(name.includes('suricata')) return '👁️';
    if(name.includes('minecraft')) return '⛏️';
    if(name.includes('tor')) return '🧅';
    if(name.includes('bitcoin')) return '₿';
    if(name.includes('ethereum')) return 'Ξ';
    if(name.includes('monero')) return '🔒';
    if(name.includes('ntop')) return '📊';
    return '📦';
}

function filterGrid(query) {
    if(!query) { switchView('official'); return; }
    
    const grid = document.getElementById('main-grid');
    grid.innerHTML = '';
    
    const all = { ...REGISTRY_DATA.official, ...REGISTRY_DATA.community };
    const filtered = {};
    
    Object.entries(all).forEach(([k, v]) => {
        if(k.includes(query) || v.desc.toLowerCase().includes(query.toLowerCase())) {
            filtered[k] = v;
        }
    });
    
    renderRows(filtered, false);
}