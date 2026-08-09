# Kura Backend — Sale Data Room

**Product:** Kura  
**Legal entity:** Kura Finance LLC  
**Asset:** BackendServer (this repository)  
**Classification:** Confidential — for prospective buyers under NDA / SPA process only

[繁體中文](README.zh-TW.md)

This Data Room is a **curated index** of materials already in the repo. It does **not** include live secrets, customer PII dumps, or production database exports. Those transfer under the SPA and [HANDOFF.md](../HANDOFF.md).

---

## 1. How to use this room

| Audience | Start here |
|----------|------------|
| Legal / corporate | §2 Corporate & IP |
| Technical diligence | §3 Product & engineering |
| Ops / IT cutover | §4 Infrastructure & handoff |
| Deal team | §5 Room completeness checklist |

Share this folder (or the whole `docs/` tree + `LICENSE` + source) via your VDR. Keep root `LICENSE` with any source archive.

---

## 2. Corporate & IP

| Item | Location | Notes |
|------|----------|-------|
| Proprietary license | [../../LICENSE](../../LICENSE) | All Rights Reserved — Kura Finance LLC |
| License (zh courtesy) | [../legal/LICENSE.zh-TW.md](../legal/LICENSE.zh-TW.md) | English prevails |
| Third-party OSS notices | [../legal/THIRD_PARTY_NOTICES.md](../legal/THIRD_PARTY_NOTICES.md) | Permissive stack; no GPL/AGPL found |
| Entity / product naming | Product **Kura**; company **Kura Finance LLC** | Consistent in LICENSE / package.json |
| IP assignment evidence | Outside repo (employment / contractor agreements) | Required in SPA diligence |
| Copyright years | 2024–2026 | See LICENSE |

**Not in repo (bring from counsel / sellers):** formation docs, cap table, SPA drafts, employee IP assignments, trademarks, privacy policy, terms of use.

---

## 3. Product & engineering

| Item | Location |
|------|----------|
| Product overview | [../PRODUCT.md](../PRODUCT.md) |
| Architecture | [../ARCHITECTURE.md](../ARCHITECTURE.md) |
| API surface & gates | [../API.md](../API.md) |
| Security model | [../SECURITY.md](../SECURITY.md) |
| Environment catalog | [../ENVIRONMENT.md](../ENVIRONMENT.md) |
| API keys inventory | [../API_KEYS.md](../API_KEYS.md) |
| Operations / deploy | [../OPERATIONS.md](../OPERATIONS.md) |
| Source code | Repository root (`src/`, `prisma/`) |
| Schema history | `prisma/migrations/` |
| Dependency lock | `package-lock.json` |

### Feature map (backend)

Auth · Plaid · Assets · Exchange · DeBank · Wallet · **Treasury (Pro/Ultimate)** · Bridge · Dinari · Stripe · Notifications · Waitlist · Platform / Privy / LI.FI analytics

---

## 4. Infrastructure & handoff

| Item | Location |
|------|----------|
| Cutover checklist | [../HANDOFF.md](../HANDOFF.md) |
| Deploy workflow | [../../.github/workflows/deploy.yml](../../.github/workflows/deploy.yml) |
| Dockerfile | [../../Dockerfile](../../Dockerfile) |
| Secret **names** (not values) | Listed in HANDOFF + ENVIRONMENT |

**Out of band (secure channel only):** GitHub Secrets values, GCP SA keys, DB passwords, partner API keys, production DB snapshots.

---

## 5. Room completeness checklist

### Included in this Data Room (via links)

- [x] Proprietary LICENSE
- [x] Third-party license inventory
- [x] Product / architecture / API / security / env / ops docs (EN + zh-TW)
- [x] Sale handoff checklist
- [x] Pointers to source, migrations, CI deploy path

### Seller must supply separately

- [ ] Executed / draft SPA and schedules
- [ ] Corporate formation & good standing (Kura Finance LLC)
- [ ] Contractor / employee IP assignment agreements
- [ ] Privacy Policy / Terms / app store listings
- [ ] Partner contract assignments (Plaid, Stripe, Bridge, Dinari, Privy, etc.)
- [ ] Production metrics / revenue exhibits (if any)
- [ ] Secure secret transfer & access revocation plan

### Explicitly excluded (do not drop into VDR)

- `.env*` files or secret values
- Raw production database dumps (unless negotiated under DPA)
- Customer PII exports
- Private keys / PEM private material

---

## 6. Suggested VDR folder layout

If copying into an external virtual data room, mirror:

```
01_Corporate_IP/
  LICENSE
  LICENSE.zh-TW.md
  THIRD_PARTY_NOTICES.md
02_Product_Technical/
  PRODUCT.md
  ARCHITECTURE.md
  API.md
  SECURITY.md
  ENVIRONMENT.md
  API_KEYS.md
  OPERATIONS.md
03_Transfer/
  HANDOFF.md
04_Source_Pointer/
  README.md          # link or archive of BackendServer (no node_modules)
```

Bilingual files: include `*.zh-TW.md` alongside English where available.

---

## 7. Document index (full `docs/`)

See [../README.md](../README.md).
