document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 60000);
    fetchCorks();
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
        const data = await response.json();
        
        // Update Meta
        document.getElementById('signer-display').innerText = `AUTH: ${data.meta.signing_authority}`;
        
        // Update Counts
        const commCount = data.community ? Object.keys(data.community).length : 0;
        document.getElementById('comm-count').innerText = commCount;

        // Render Grids
        renderRows(data.official, 'official-grid', true);
        renderRows(data.community, 'community-grid', false);
        
    } catch (error) {
        console.error(error);
    }
}

function renderRows(corksObj, gridId, isOfficial) {
    const grid = document.getElementById(gridId);
    if (!grid || !corksObj) return;

    Object.entries(corksObj).forEach(([key, cork]) => {
        const el = document.createElement('div');
        el.className = 'app-row';
        
        // Determine Status Icon
        let statusDot = '<span class="status-dot dot-suspicious" title="Audit Pending"></span>';
        if (cork.audit && cork.audit.audit_result === 'SAFE') {
            statusDot = '<span class="status-dot dot-safe" title="Audit: SAFE"></span>';
        }

        // Generate Icon (Simulated)
        const iconChar = getIconFor(key);

        el.innerHTML = `
            <div class="app-icon">${iconChar}</div>
            <div class="app-details">
                <div class="app-name">${key}</div>
                <div class="app-cat">
                    ${statusDot} ${cork.ram || 'RAM?'} • ${isOfficial ? 'Verified' : 'Community'}
                </div>
            </div>
            <button class="get-btn" onclick="install('${key}', this)">GET</button>
        `;
        grid.appendChild(el);
    });
}

function install(key, btn) {
    btn.innerText = "COPIED";
    btn.classList.add('clicked');
    navigator.clipboard.writeText(`ci5 run ${key}`);
    setTimeout(() => {
        btn.innerText = "OPEN";
        btn.classList.remove('clicked');
        // Visual indicator only - terminal would handle actual open
    }, 2000);
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