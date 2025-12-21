###### 📟 [ci5.run](https://github.com/dreamswag/ci5.run): curl ~ 🔬 [ci5.host](https://github.com/dreamswag/ci5.host): cure ~ 🧪 [ci5.dev](https://github.com/dreamswag/ci5.dev): cork ~ 🥼 [ci5.network](https://github.com/dreamswag/ci5.network): cert ~ 📡[ci5](https://github.com/dreamswag/ci5)🛰️

# 🧬⚗️ **[ci5.dev](https://ci5.dev): [cork]munity** 👨‍🔬🧪

## 🥽 "Corks?"

**Docker containers that run in your Pi 5's "Leeway" RAM:**

- 8GB Pi 5 needs ~1.5GB for routing
- ~6.5GB is available for Corks
  -  sandboxed services that don't compromise network stability

---

## 📦 Registry

> ⚠️ **'Ci5 Approved'** Corks:

### Official Corks

| Cork | Purpose | RAM |
|------|---------|-----|
| `adguard` | Network-wide ad blocking | 128MB |
| `unbound` | Recursive DNS resolver | 64MB |
| `ntopng` | Traffic analysis | 256MB |

### Community Corks

| Cork | Purpose | RAM |
|------|---------|-----|
| `tor-relay` | Onion routing relay | 512MB |
| `minecraft-paper` | PaperMC Server | 4GB+ |
| `home-assistant` | Home automation | 1GB |
| `monero-node` | XMR Daemon | 2GB |
| `bitcoin-node` | Full BTC node | 2GB |

---

## 🔧 Installation

**On Device:**

```bash
# Add to loadout
echo "dreamswag/cork-ntopng" >> /etc/ci5_corks

# Apply
curl ci5.run/free | sh
```

**Or manually:**

```bash
cd /opt/ci5/corks
git clone https://github.com/dreamswag/cork-ntopng
cd cork-ntopng
docker compose up -d
```

---

## 🔍 Search

**Via Terminal UI:**
```
root@ci5:~# cork search home
[COMMUNITY] home-assistant
    Open source home automation hub (IoT).
```

**Via API:**
```bash
curl https://ci5.dev/corks.json | jq
```

---

## 🛸 Submit to Cork Registry

1. Create repo with `docker-compose.yml`
2. Ensure ARM64 images
3. Handle persistence via volumes
4. Fork this repo
5. Add entry to `corks.json`
6. Submit PR

📚 **[Submission Guidelines →](https://github.com/dreamswag/ci5.network/blob/main/docs/CORKS.md)**

---

## 📁 Repository Structure

```
ci5.dev/
├── index.html     # Registry browser UI
├── corks.json     # AUTHORITATIVE registry
├── _headers       # CORS config
└── static/
    └── script.js  # Search logic
```
