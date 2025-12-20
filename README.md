###### 📟 [ci5.run](https://github.com/dreamswag/ci5.run): curl ~ 📡 [ci5.host](https://github.com/dreamswag/ci5): core ~ 🧪 [ci5.dev](https://github.com/dreamswag/ci5.dev): cork ~ 🔬 [ci5.network](https://github.com/dreamswag/ci5.network): cert

# 🧬⚗️ **[ci5.dev](ci5.dev): [cork]munity** 👨‍🔬🧪

## 🥼 **Unmanaged Openwrt Operating Environment (UOOE)** 🥽

Ci5 separates the network into two planes:
1.  **LET (Logical Execution Time):** `core` **Operating System** 

             > Immutable, timing-critical, essential. (The Router)
2.  **UOE (Unmanaged Operating Environment):** `cork` **Layer**

             > Mutable, chaotic, optional. (The Apps)

## 😶‍🌫️ Leeway 😶‍🌫️
**Raspberry Pi 5 8GB** provides **~7GB of "Leeway" RAM** that is not required for routing.  

This repository contains the registry of "**Corks**" (**Sandboxed Containers**): 
* designed to **utilise this space without compromising the stability of the Core**.

## 🔎 Instructions 🔍
### **On your Device:**
```bash
# Search for modules
cork search <term>

# Add to your loadout
cork install <name>

# Apply (Wipe & Reload)
curl ci5.run/free | sh
```

## 🛸 Submit💨

1. Create a repo containing a `docker-compose.yml`.
2. Ensure it handles its own persistence (volumes).
3. Fork this repo.
4. Add your entry to `corks.json`.
