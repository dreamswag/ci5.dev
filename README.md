###### 📟 [ci5.run](https://ci5.run): curl ~ 📡 [ci5.host](https://github.com/dreamswag/ci5): core ~ 🧪 [ci5.dev](https://ci5.dev): cork ~ 🔬 [ci5.network](https://ci5.network): cert

# 🧬⚗️ ci5.dev [CORK REGISTRY] 👨‍🔬🧪

## **The Unmanaged Operating Environment (UOE).**

Ci5 separates the network into two planes:
1.  **LET (Logical Execution Time):** The `core` OS. Immutable, timing-critical, essential. (The Router).
2.  **UOE (Unmanaged Operating Environment):** The `cork` layer. Mutable, chaotic, optional. (The Apps).

## The Leeway
The Raspberry Pi 5 8GB provides ~7GB of "Leeway" RAM that is not required for routing. This repository contains the registry of "Corks" (Sandboxed Containers) designed to utilize this space without compromising the stability of the Core.

## 🔎 Instructions for Use 🔍
**On your Device:**
```bash
# Search for modules
cork search <term>

# Add to your loadout
cork install <name>

# Apply (Wipe & Reload)
curl ci5.run/free | sh
```

## 🛸How to Submit

1. Create a repo containing a `docker-compose.yml`.
2. Ensure it handles its own persistence (volumes).
3. Fork this repo.
4. Add your entry to `corks.json`.
5. PR.