document.addEventListener('DOMContentLoaded', async () => {
    const out = document.getElementById('terminalOutput');
    const input = document.getElementById('domainInput');
    const termWindow = document.getElementById('terminalWindow');
    const header = document.getElementById('headerHandle');
    
    // Controls
    const minBtn = document.getElementById('minBtn');
    const maxBtn = document.getElementById('maxBtn');
    const closeBtn = document.getElementById('closeBtn');
    const taskbar = document.getElementById('taskbar');
    const restoreBtn = document.getElementById('restoreBtn');

    // --- 1. SOVEREIGN MODE ---
    function isSovereignMode() {
        const h = window.location.hostname;
        return h.includes('ipfs') || h.includes('.eth') || h.includes('localhost') || h.includes('limo');
    }

    document.addEventListener('click', (e) => {
        if (window.getSelection().type !== 'Range') { input.focus(); }
    });

    // --- 2. LIVE STATS ---
    let globalCount = 0; 
    async function fetchGlobalCount() {
        try {
            if (isSovereignMode()) return; 
            const res = await fetch('/api/stats'); 
            if (res.ok) {
                const data = await res.json();
                globalCount = data.count || globalCount;
            }
        } catch (e) {}
        updateStatusLine();
    }
    function updateStatusLine() {
        const statusEl = document.getElementById('live-status');
        if (statusEl) { statusEl.innerHTML = globalCount.toLocaleString(); }
    }
    setInterval(fetchGlobalCount, 15000);

    // --- 3. WINDOW LOGIC (RESIZE/DRAG) ---
    // [Use Standard Window Logic logic from previous iterations]
    const resizers = document.querySelectorAll('.resizer');
    let isResizing = false;
    resizers.forEach(resizer => {
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault(); isResizing = true; termWindow.style.transition = 'none'; 
            const rect = termWindow.getBoundingClientRect();
            const startX = e.clientX; const startY = e.clientY;
            const startWidth = rect.width; const startHeight = rect.height;
            const startTop = rect.top; const startLeft = rect.left;
            const onMouseMove = (moveEvent) => {
                const dx = moveEvent.clientX - startX; const dy = moveEvent.clientY - startY;
                if (resizer.classList.contains('e') || resizer.classList.contains('ne') || resizer.classList.contains('se')) termWindow.style.width = `${startWidth + dx}px`;
                if (resizer.classList.contains('s') || resizer.classList.contains('se') || resizer.classList.contains('sw')) termWindow.style.height = `${startHeight + dy}px`;
                if (resizer.classList.contains('w') || resizer.classList.contains('nw') || resizer.classList.contains('sw')) { termWindow.style.width = `${startWidth - dx}px`; termWindow.style.left = `${startLeft + dx}px`; }
                if (resizer.classList.contains('n') || resizer.classList.contains('ne') || resizer.classList.contains('nw')) { termWindow.style.height = `${startHeight - dy}px`; termWindow.style.top = `${startTop + dy}px`; }
            };
            const onMouseUp = () => { isResizing = false; termWindow.style.transition = 'opacity 0.3s, transform 0.1s'; document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
            document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp);
        });
    });

    let isDragging = false; let dragOffsetX = 0; let dragOffsetY = 0;
    header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || isResizing) return;
        isDragging = true; header.style.cursor = 'grabbing'; termWindow.style.transition = 'none';
        if (termWindow.classList.contains('maximized')) { termWindow.classList.remove('maximized'); termWindow.style.top = (e.clientY - 20) + 'px'; termWindow.style.left = (e.clientX - (termWindow.offsetWidth / 2)) + 'px'; }
        const rect = termWindow.getBoundingClientRect(); dragOffsetX = e.clientX - rect.left; dragOffsetY = e.clientY - rect.top;
        termWindow.style.width = rect.width + 'px'; termWindow.style.height = rect.height + 'px'; termWindow.style.transform = 'none'; termWindow.style.left = rect.left + 'px'; termWindow.style.top = rect.top + 'px';
    });
    document.addEventListener('mousemove', (e) => { if (!isDragging) return; termWindow.style.left = (e.clientX - dragOffsetX) + 'px'; termWindow.style.top = (e.clientY - dragOffsetY) + 'px'; });
    document.addEventListener('mouseup', () => { if(isDragging) { isDragging = false; header.style.cursor = 'default'; termWindow.style.transition = 'opacity 0.3s, transform 0.1s'; } });
    minBtn.addEventListener('click', () => { termWindow.classList.add('minimized'); taskbar.classList.remove('hidden'); });
    restoreBtn.addEventListener('click', () => { termWindow.classList.remove('minimized'); taskbar.classList.add('hidden'); });
    maxBtn.addEventListener('click', () => { termWindow.classList.toggle('maximized'); });
    closeBtn.addEventListener('click', () => { termWindow.classList.add('closing-anim'); setTimeout(() => { termWindow.style.display = 'none'; termWindow.classList.remove('closing-anim'); setTimeout(() => { termWindow.style.display = 'flex'; termWindow.style.opacity = '0'; termWindow.style.top = '50%'; termWindow.style.left = '50%'; termWindow.style.transform = 'translate(-50%, -50%)'; termWindow.style.width = ''; termWindow.style.height = ''; termWindow.classList.remove('maximized', 'minimized'); out.innerHTML = ''; setTimeout(() => { termWindow.style.transition = 'opacity 0.5s'; termWindow.style.opacity = '1'; setTimeout(() => { termWindow.style.transition = 'opacity 0.3s, transform 0.1s'; init(); }, 500); }, 100); }, 4000); }, 250); });

    // --- 4. TERMINAL BOOT ---
    async function getLatestCommit() {
        try {
            const res = await fetch('https://api.github.com/repos/dreamswag/ci5/commits/main');
            if (res.ok) {
                const data = await res.json();
                return data.sha.substring(0, 7);
            }
        } catch (e) { return "OFFLINE"; }
        return "UNKNOWN";
    }

    async function getBootSequence() {
        const isSov = isSovereignMode();
        const release = "https://github.com/dreamswag/ci5/releases/latest/download";
        const corkHash = await getLatestCommit();
        // Dynamic commands
        const c_free = isSov ? `curl -L ${release}/install-full.sh | sh` : "curl ci5.run/free | sh";

        return [
            "<span class='green'>UPLINK ESTABLISHED.</span>",
            `IDENTITY: [<span class='red'>TELEMETRY_ERR:41</span><span id='glitch'>0</span>]`,
            `CORK INTEGRITY: [<span class='purple'>${corkHash}</span>]`, 
            isSov ? "<span class='purple'>[ SOVEREIGN MIRROR ACTIVE ]</span>" : "",
            `OASIS CHECKPOINT: <span class='purple' id='live-status'>${globalCount.toLocaleString()}</span> SOVEREIGNS`,
            "<span class='ghost'>...send word if you make it</span>", 
            "\n<span class='dim'>COMMAND PROTOCOLS</span>",
            "<span class='dim'>--------------------</span>",
            `  > <span class='green'>FREE</span>       ${c_free}`, 
            `  > <span class='green'>WARD</span>       curl ci5.run/ward | sh`, 
            `  > <span class='cyan'>CORK</span>       (Registry Search)`,
            `  > <span class='cyan'>RRUL</span>       curl ci5.run/rrul | sh`, 
            `  > <span class='cyan'>FAST</span>       curl ci5.run/fast | sh`, 
            `  > <span class='purple'>SAFE</span>       curl ci5.run/safe | sh`, 
            `  > <span class='red'>VOID</span>       curl ci5.run/void | sh`, 
            "\n"
        ];
    }

    function startGlitch() {
        const el = document.getElementById('glitch');
        if (!el) return;
        const glitchLoop = () => { setTimeout(() => { el.textContent = '7'; el.style.opacity = '0.8'; setTimeout(() => { el.textContent = '0'; el.style.opacity = '1'; glitchLoop(); }, 80); }, Math.random() * 9000 + 3000); };
        glitchLoop();
    }

    async function init() {
        fetchGlobalCount(); 
        const boot = await getBootSequence();
        for (let line of boot) {
            if(line === "") continue;
            out.innerHTML += line + "\n";
            out.scrollTop = out.scrollHeight;
            await new Promise(r => setTimeout(r, 40));
        }
        startGlitch();
    }

    // --- 5. COMMAND HANDLER (THE RUN -> DEV CONNECTION) ---
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const val = input.value.trim().toLowerCase();
            input.value = '';
            
            out.innerHTML += `<span class='green'>root@ci5:~$</span> <span class='white'>${val}</span>\n`;

            if (val === 'free') {
                 out.innerHTML += `\n<span class='cyan'>GENESIS / INSTALL:</span> <span class='white'>The Transformation.</span>\n<span class='dim'>Wipes Pi OS and flashes the Ci5 Golden Image.</span>\n<span class='dim'>RUN:</span> curl ci5.run/free | sh\n\n`;
            } else if (val === 'dev') {
                 out.innerHTML += `\n<span class='red'>WARNING: BLEEDING EDGE.</span>\n<span class='white'>Installs directly from source (ci5.host/cork).</span>\n<span class='dim'>RUN:</span> curl ci5.run/dev | sh\n\n`;

            // --- THE CROSS-DOMAIN SEARCH ---
            } else if (val.startsWith('cork')) {
                const args = val.split(' ');
                const cmd = args[1];
                const query = args[2];

                if (cmd === 'search') {
                    out.innerHTML += `<span class='purple'>CONNECTING TO FACTORY [ci5.dev]...</span>\n`;
                    try {
                        // FETCHING FROM DEV DOMAIN
                        const res = await fetch('https://ci5.dev/corks.json'); 
                        const db = await res.json();
                        let found = false;

                        if (db.official) {
                            for (const [key, data] of Object.entries(db.official)) {
                                if (!query || key.includes(query)) {
                                    out.innerHTML += `[<span class='green'>OFFICIAL</span>] <span class='white'>${key}</span>\n    <span class='dim'>${data.desc}</span>\n`;
                                    found = true;
                                }
                            }
                        }
                        if (db.community) {
                            for (const [key, data] of Object.entries(db.community)) {
                                if (!query || key.includes(query)) {
                                    out.innerHTML += `[<span class='orange'>COMMUNITY</span>] <span class='white'>${key}</span>\n    <span class='dim'>${data.desc}</span>\n`;
                                    found = true;
                                }
                            }
                        }
                        if (!found) out.innerHTML += `<span class='red'>No corks found matching '${query}'</span>\n`;
                    } catch (e) {
                        out.innerHTML += `<span class='red'>FACTORY OFFLINE.</span>\n`;
                    }
                    out.innerHTML += `\n`;

                } else if (cmd === 'install') {
                    if (!query) {
                        out.innerHTML += `<span class='red'>Err: Specify a cork name.</span>\n`;
                    } else {
                        out.innerHTML += `<span class='green'>QUEUED:</span> ${query}\n`;
                        out.innerHTML += `<span class='dim'>To apply: Add to /etc/ci5_corks or config soul.</span>\n\n`;
                    }
                } else {
                     out.innerHTML += `\n<span class='purple'>CORK REGISTRY (v1.0):</span>\n`;
                     out.innerHTML += `  <span class='white'>cork search &lt;term&gt;</span>  - Query ci5.dev\n`;
                     out.innerHTML += `  <span class='white'>cork install &lt;name&gt;</span> - Add to loadout\n\n`;
                }

            } else if (['ward', 'rrul', 'fast', 'safe', 'void', 'home', 'away', 'heal', 'true', 'base', 'auto'].includes(val)) {
                out.innerHTML += `<span class='dim'>RUN:</span> curl ci5.run/${val} | sh\n\n`;
            } else if (val === 'clear') {
                out.textContent = ''; 
            } else if (val !== '') {
                out.innerHTML += `<span class='dim'>Err: Unknown command</span>\n`;
            }
            out.scrollTop = out.scrollHeight;
        }
    });
    init();
});