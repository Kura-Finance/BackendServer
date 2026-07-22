# API surface

[繁體中文](API.zh-TW.md)

Base: production host (e.g. `https://api.kura-finance.com`). Auth: session from `/api/auth` unless noted.

Response shape (typical): `{ success, data }` or `{ success: false, error: { code, message, details? } }`.

## Mounts

| Mount | Auth | Notes |
|-------|------|-------|
| `GET /health` | No | Liveness |
| `/.well-known/apple-app-site-association` | No | iOS associated domains / passkeys |
| `/.well-known/assetlinks.json` | No | Android Digital Asset Links |
| `/api/auth` | Mixed | Login, logout, me, passkeys, referrals |
| `/api/plaid` | Yes | Bank linking |
| `/api/assets` | Yes | Aggregated holdings / history |
| `/api/exchange` | Yes | CEX via CCXT |
| `/api/debank` | Yes | On-chain portfolios |
| `/api/stripe` | Mixed | Checkout / portal / billing-status (auth); webhook (Stripe signature) |
| `/api/wallet` | Yes | Personal wallet / SCA |
| `/api/treasuries` | Yes + **Pro/Ultimate** | Org Treasury Safes (`requirePaidTier`) |
| `/api/bridge` | Mixed | On/off-ramp; webhook (Bridge RSA signature) |
| `/api/dinari` | Yes | Tokenized stocks (whitelist for Entity/KYC) |
| `/api/notifications` | Yes | Notifications |
| `/api/waitlist` | Partial | Public signup endpoints |
| `/api/platform-insights` | Public GETs | Investor summary includes live Morpho Earn FeeWrapper AUM (`earn.totalAssetsUsd`) |
| `/api/privy-analytics` | Yes | Privy analytics |
| `/api/lifi-analytics` | Yes | LI.FI integrator volume |

## Access gates

1. **`requireAuth`** — most `/api/*` routes.
2. **`webTierGate`** — Web clients: Basic may use exempt paths (auth, Stripe billing, waitlist, some analytics); other Web APIs need Pro / Ultimate.
3. **`requirePaidTier`** — `/api/treasuries` for **all** client types: Pro / Ultimate only. Basic → `403 SUBSCRIPTION_REQUIRED`.

## Webhooks (raw body)

| Path | Verifier |
|------|----------|
| `/api/stripe/webhook` | Stripe signature (`STRIPE_WEBHOOK_SECRET`) |
| `/api/bridge/webhook` | Bridge RSA PEM (`BRIDGE_WEBHOOK_PUBLIC_KEY`) |

## Treasuries (summary)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/treasuries` | Workspace `{ treasuries[], activeTreasuryId }` |
| POST | `/api/treasuries` | Create (idempotent on address) |
| PUT | `/api/treasuries` | Replace entire workspace |
| PUT | `/api/treasuries/active` | Set active |
| PATCH | `/api/treasuries/:id` | Rename |
| DELETE | `/api/treasuries/:id` | Remove |

See domain code under `src/domains/treasury/`.
