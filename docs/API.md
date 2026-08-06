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
| `/api/platform-insights` | Public GETs | Investor summary: `platformRevenue` is the single source of truth (Bridge/Swap 0.25%, Dinari 0%, Earn 10% perf fee, Card reserved); also live Morpho Earn AUM (`earn`) |
| `/api/privy-analytics` | Yes | Privy analytics |
| `/api/lifi-analytics` | Yes | LI.FI integrator volume |
| `/api/admin` | Auth + **admin** | `requireAuth` + `requireAdmin` (`ADMIN_EMAILS` / `ADMIN_EMAIL`); web tier exempt |

## Access gates

1. **`requireAuth`** — most `/api/*` routes.
2. **`webTierGate`** — Web clients: Basic may use exempt paths (auth, Stripe billing, waitlist, some analytics, `/api/admin`); other Web APIs need Pro / Ultimate.
3. **`requirePaidTier`** — `/api/treasuries` for **all** client types: Pro / Ultimate only. Basic → `403 SUBSCRIPTION_REQUIRED`.
4. **`requireAdmin`** — `/api/admin/*`: logged-in user email must be in `ADMIN_EMAILS` (or `ADMIN_EMAIL`). Else `403 ADMIN_REQUIRED`.

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

## Platform insights (Investor)

`GET /api/platform-insights/summary` returns `data.platformRevenue` as the **only** Platform revenue figure the frontend should display. Do not re-estimate fees client-side.

| Product | Rate | Notes |
|---------|------|-------|
| Bridge (Crypto <> Fiat) | 0.25% of process | Kura margin only |
| Swap (LI.FI) | 0.25% of process | Integrator fee accounting |
| Dinari (US Stocks) | 0% for now | Process volume still tracked |
| Earn | 10% performance fee on yield | Recognized revenue `$0` until harvest events; AUM in `earn` / `byProduct.earn.aumUsd` |
| Card | Reserved | Always present in `byProduct.card` |
| Subscriptions | Paid amount | Stripe AR |

Prefer `platformRevenue.totalUsd` / `byProduct` over legacy `process.totalNetUsd` (kept as a mirror).

## Admin — Dashboard

Auth: session + admin email allowlist. Read APIs for the Kura Admin console (`dashboard`).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/users` | All users: tier, EOA/SCA, Bridge/Dinari KYC, all-time Bridge/Dinari revenue |
| GET | `/api/admin/users/:id` | Single user (`404 NOT_FOUND` if missing) |
| GET | `/api/admin/overview` | Platform metrics (KYC funnel, Bridge/Dinari/Li.Fi, FeeWarp TVL, current-month `bridgeFraud` rates) |
| GET | `/api/admin/earn/fee-warps` | Morpho FeeWrapper vaults on Base (live TVL) |
| GET | `/api/admin/lifi/summary` | Platform Li.Fi `{ volumeUsd, feeUsd, transferCount }` (all-time `transfer_done`) |

Notes:

- `walletBalanceUsd` / `totalWalletBalanceUsd` come from a live DeBank fetch on each user's `scaAddress` (spot + DeFi; 5‑minute in-memory cache). Users without SCA stay `0`. Requires `DEBANK_ACCESS_KEY`.
- FeeWarp `mau` / `feeWarpMauTotal` are always `0` until a deposit-MAU indexer exists; TVL is live from Morpho.
- Revenue totals come from `PlatformRecord` (same ledger as Investor platform-insights).

## Admin — Bridge Funds Requests / Fraud Alerts

Auth: session + admin email allowlist. Funding for returns: Bridge Wallet (`BRIDGE_WALLET_ID`).

On sync, **new** `fraud=true` rows trigger: Bridge customer `PUT status=paused`, platform `User.fraudSuspendedAt`, and admin email (`ADMIN_EMAIL`).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/bridge/funds-requests/sync?force=` | Poll Bridge `GET /funds_requests`, upsert; auto-pause new fraud alerts |
| GET | `/api/admin/bridge/funds-requests?fraud=&status=&limit=&offset=` | List local recalls + `paymentProcessed` (use `fraud=true` for Fraud Alerts) |
| POST | `/api/admin/bridge/funds-requests/:id/pause` | Pause Bridge customer + platform-suspend user |
| POST | `/api/admin/bridge/funds-requests/:id/return` | Create `fiat_deposit_return` via Bridge Wallet |
| POST | `/api/admin/bridge/funds-requests/:id/remediate` | One-click: pause + return (pause kept if return fails) |
| GET | `/api/admin/bridge/fraud-rate?month=YYYY-MM` | Monthly fraud rate (US=deposit month, EUR=recall month; 50 bps Penalty Box / 7% critical) |
| POST | `/api/admin/bridge/customers/:bridgeCustomerId/unpause` | Unpause Bridge customer after sender withdraws claim |
| POST | `/api/admin/users/:id/clear-fraud-suspend` | Clear platform suspend (does not unpause Bridge) |

VA webhook `refunded` marks matching funds requests `returned`. Fraud-suspended users cannot `DELETE /api/auth/me` or start new Bridge KYC.