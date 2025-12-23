let REGISTRY_DATA = null;

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
        document.getElementById('signer-display').innerText = `AUTH: ${REGISTRY_DATA.meta.signing_authority}`;
        
        // Initial Render (Official)
        switchView('official');
        
    } catch (error) {
        console.error(error);
        document.getElementById('signer-display').innerText = "OFFLINE MODE";
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
    // (Highlighting logic would go here if we passed 'this')

    if (viewName === 'submit') {
        browser.classList.add('hidden');
        submission.classList.remove('hidden');
        return;
    }

    // Browser Mode
    submission.classList.add('hidden');
    browser.classList.remove('hidden');
    grid.innerHTML = '';

    let sourceData = {};

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
        // Combine and sort
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

// MODAL LOGIC
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
    
    const tag = document.getElementById('modal-tag');
    tag.innerText = type === 'official' ? "OFFICIAL SIGNED" : "COMMUNITY";
    tag.style.color = type === 'official' ? "#30d158" : "#ff9f0a";
    tag.style.borderColor = type === 'official' ? "#30d158" : "#ff9f0a";

    // Show
    toggleModal(true);
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