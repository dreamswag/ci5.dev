let REGISTRY_DATA = null;
const TELEMETRY_REPO = "dreamswag/ci5"; 

document.addEventListener('DOMContentLoaded', () => {
    fetchCorks();
    
    // Search Listener
    document.getElementById('search-box').addEventListener('input', (e) => {
        filterGrid(e.target.value);
    });
});

async function fetchCorks() {
    try {
        const response = await fetch('corks.json');
        if (!response.ok) throw new Error("Manifest Missing");
        REGISTRY_DATA = await response.json();
        
        if (document.getElementById('signer-display')) {
            document.getElementById('signer-display').innerText = `AUTH: ${REGISTRY_DATA.meta.signing_authority}`;
        }
        
        switchView('official');
        
    } catch (error) {
        console.error(error);
        if (document.getElementById('signer-display')) {
            document.getElementById('signer-display').innerText = "OFFLINE MODE";
        }
    }
}

// VIEW CONTROLLER
function switchView(viewName, element) {
    const browser = document.getElementById('browser-view');
    const submission = document.getElementById('submission-view');
    const header = document.getElementById('section-header');
    const hero = document.getElementById('hero-card');

    // NAV HIGHLIGHT LOGIC
    if (element) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
    }
    
    // Hide All Views
    browser.classList.add('hidden');
    submission.classList.add('hidden');

    if (viewName === 'submit') {
        submission.classList.remove('hidden');
        return;
    }

    // Browser Mode
    browser.classList.remove('hidden');
    const grid = document.getElementById('main-grid');
    grid.innerHTML = '';

    if (viewName === 'official') {
        header.innerText = "🃏 ci5-canon-corks";
        hero.classList.remove('hidden');
        renderRows(REGISTRY_DATA.official, true);
    } else if (viewName === 'top') {
        header.innerText = "🌠 User Favourite Corks";
        hero.classList.add('hidden');
        renderRows(REGISTRY_DATA.community, false);
    } else if (viewName === 'community') {
        header.innerText = "🛸 Recently Deployed Corks";
        hero.classList.add('hidden');
        renderRows(REGISTRY_DATA.community, false); 
    } 
}

function getSubmitterFromRepo(repoPath) {
    // Extract username from repo path like "dreamswag/cork-adguard" or "community/cork-tor-relay"
    if (!repoPath) return 'unknown';
    const parts = repoPath.split('/');
    return parts[0] || 'unknown';
}

function renderRows(corksObj, isOfficial) {
    const grid = document.getElementById('main-grid');
    
    Object.entries(corksObj).forEach(([key, cork]) => {
        const el = document.createElement('div');
        el.className = 'app-row';
        el.onclick = () => openDetail(key, isOfficial ? 'official' : 'community'); 
        
        let statusDot = '<span class="status-dot dot-suspicious"></span>';
        if (cork.audit && cork.audit.audit_result === 'SAFE') {
            statusDot = '<span class="status-dot dot-safe"></span>';
        }

        const iconChar = getIconFor(key);
        const submitter = getSubmitterFromRepo(cork.repo);

        el.innerHTML = `
            <div class="app-icon">${iconChar}</div>
            <div class="app-details">
                <div class="app-name">${key}</div>
                <div class="app-cat">
                    ${statusDot} ${cork.ram || 'RAM?'} • ${isOfficial ? 'Verified' : 'Community'}
                </div>
                <div class="app-submitter">by ${submitter}</div>
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

    document.getElementById('modal-title').innerText = key;
    document.getElementById('modal-desc').innerText = cork.desc;
    document.getElementById('modal-ram').innerText = cork.ram || "Unknown";
    document.getElementById('modal-icon').innerText = getIconFor(key);
    document.getElementById('modal-cmd').innerText = `ci5 install ${key}`;
    document.getElementById('modal-source').href = `https://github.com/${cork.repo}`;
    
    const submitter = getSubmitterFromRepo(cork.repo);
    document.getElementById('modal-submitter').innerText = `by ${submitter}`;
    
    const tag = document.getElementById('modal-tag');
    tag.innerText = type === 'official' ? "OFFICIAL SIGNED" : "COMMUNITY";
    tag.style.color = type === 'official' ? "#30d158" : "#ff9f0a";
    tag.style.borderColor = type === 'official' ? "#30d158" : "#ff9f0a";

    loadDynamicTelemetry(key);
    toggleModal(true);
}

async function loadDynamicTelemetry(corkID) {
    const box = document.getElementById('community-ram-box');
    const btn = document.getElementById('telemetry-action-btn');
    
    box.innerHTML = '<span style="animation: blink 1s infinite">SEARCHING SIGNAL...</span>';
    btn.onclick = null; 
    btn.innerText = "LOADING...";

    try {
        const query = `repo:${TELEMETRY_REPO} is:issue in:title "TELEMETRY: ${corkID}"`;
        const searchReq = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}`);
        const searchData = await searchReq.json();

        if (searchData.total_count > 0) {
            const issue = searchData.items[0];
            fetchStatsFromComments(issue.number, issue.html_url);
        } else {
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
    let corks = 0; 
    let dorks = 0; 

    comments.forEach(c => {
        const text = c.body.toUpperCase();
        if (text.includes('[TELEMETRY]')) {
            const ramMatch = text.match(/RAM:(\d+)/);
            if (ramMatch) { totalRam += parseInt(ramMatch[1]); count++; }
            
            if (text.includes('STATUS:CORK') || text.includes('STATUS:OK')) corks++;
            if (text.includes('STATUS:DORK') || text.includes('STATUS:FAIL')) dorks++;
        }
    });

    if (count === 0) {
        box.innerHTML = '<span style="color:#888">AWAITING FIRST REPORT</span>';
    } else {
        const avgRam = Math.round(totalRam / count);
        const reliability = Math.round((corks / (corks + dorks)) * 100);
        
        box.innerHTML = `
            <div class="telemetry-grid">
                <div class="t-col"><div class="t-lbl">USAGE</div><div class="t-val">${avgRam}MB</div></div>
                <div class="t-col"><div class="t-lbl">CORKS %</div><div class="t-val" style="color:${reliability > 80 ? '#30d158' : '#ff453a'}">${reliability}%</div></div>
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
            const body = `Automated Telemetry Thread for ${corkID}.\n\nPost reports in format: \`[TELEMETRY] RAM:128 STATUS:CORK\``;
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