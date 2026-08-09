# Proprietary API keys vs free public endpoints

[繁體中文](API_KEYS.zh-TW.md)

This backend does **not** use Alchemy / Infura / QuickNode (or any custom chain RPC URL). On-chain portfolio data goes through **DeBank**; Earn AUM uses **Morpho’s free GraphQL**.

## Feature flags

Optional domains: toggle the `FEATURES` map in [`src/config/features.ts`](../src/config/features.ts). Disabled domains skip key validation and are not mounted. Snapshot: `GET /api/features`.

## Must have a proprietary key (no free public substitute)

| Service | Env vars | Why required |
|---------|----------|--------------|
| **App crypto** | `JWT_SECRET`, `ENCRYPTION_KEY` | Session + field encryption |
| **Postgres** | `DB_*` | Primary database |
| **Resend** | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Transactional email |
| **Plaid** | `PLAID_CLIENT_ID`, `PLAID_*_SECRET`, redirect/webhook | Bank / investment aggregation |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs | Subscriptions |
| **Privy** | `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_VERIFICATION_KEY` | Login / identity |
| **Bridge** | `BRIDGE_API_KEY`, `BRIDGE_WEBHOOK_PUBLIC_KEY` (+ wallet for returns) | Fiat on/off-ramp |
| **Dinari** | `DINARI_API_KEY_ID`, `DINARI_API_SECRET_KEY` | Tokenized stocks |
| **DeBank** | `DEBANK_ACCESS_KEY` | Multi-chain wallet balances / DeFi positions |

Replacing DeBank with “free public RPC only” would mean re-implementing multi-chain indexing (large scope, incomplete vs DeBank).

## Optional key (works without / free public default)

| Service | Env vars | Default without key |
|---------|----------|---------------------|
| **LI.FI analytics** | `LIFI_API_KEY` (optional), `LIFI_INTEGRATOR` (required for sync) | Public `https://li.quest` — key only raises rate limits |
| **Logo.dev** | `LOGO_DEV_TOKEN` | **Off by default** — logos use Google favicons + jsDelivr crypto icons |
| **Bridge Wallet** | `BRIDGE_WALLET_ID` | Only needed for fiat deposit returns |

`LIFI_INTEGRATOR` is your integrator **name**, not a secret API key (still required to filter analytics).

## Already free public (no API key)

| Service | Endpoint / approach | Used for |
|---------|---------------------|----------|
| **Morpho GraphQL** | `https://api.morpho.org/graphql` | Earn FeeWrapper AUM |
| **Yahoo Finance** (`yahoo-finance2`) | Unofficial public | Stock 24h change |
| **Binance public ticker** (CCXT) | Exchange public API | Crypto 24h change |
| **Google favicons** | `https://www.google.com/s2/favicons?domain=…` | Exchange / stock / institution logos |
| **Crypto icons CDN** | jsDelivr `cryptocurrency-icons` | Crypto symbol logos |
| **Dicebear** | Public SVG URLs | Default avatars |

## Per-user keys (not env)

| Source | Storage | Notes |
|--------|---------|-------|
| CEX API keys (Binance, OKX, …) | Encrypted in DB via CCXT | User-supplied; required for private balances |

## Infra (deploy, not product APIs)

`GCP_PROJECT_ID`, `GCP_SA_KEY` — GitHub Actions → Cloud Run only.

See also [ENVIRONMENT.md](ENVIRONMENT.md) for the full variable list.
