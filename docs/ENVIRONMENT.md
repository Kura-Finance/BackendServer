# Environment variables

[繁體中文](ENVIRONMENT.zh-TW.md)

Template: **[../.env.example](../.env.example)** — copy to `.env.development` for local use.

Local development loads `.env.development` when `NODE_ENV` is not `production` and `DB_HOST` is unset (see `src/config/env.ts`). Never commit real `.env*` files (`.env.example` is tracked).

Validation: `validateEnvironment()` runs at boot. Partner-key checks run only when the matching flag in [`src/config/features.ts`](../src/config/features.ts) is on. Some integrations warn and continue; others exit in production when missing.

## Feature flags (domain toggles)

**Source of truth:** edit the `FEATURES` map in [`src/config/features.ts`](../src/config/features.ts) (not env). Snapshot: `GET /api/features` and `GET /health` → `features`.

Always on: `auth`, `assets`. Optional keys in `FEATURES`: `email`, `plaid`, `exchange`, `notifications`, `debank`, `stripe`, `wallet`, `treasury`, `bridge`, `dinari`, `waitlist`, `platformInsights`, `privyAnalytics`, `lifiAnalytics`, `admin`.

## Core (required)

| Variable | Required | Notes |
|----------|----------|-------|
| `JWT_SECRET` | Yes | App session signing |
| `ENCRYPTION_KEY` | Yes | 64 lowercase hex chars (32 bytes AES-256) |
| `NODE_ENV` | Recommended | `development` / `production` |
| `PORT` | No | Default `8080` |

Generate `ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Database

| Variable | Required | Notes |
|----------|----------|-------|
| `DB_USER` | Prod | Default `postgres` in URL builder |
| `DB_PASSWORD` | Prod | |
| `DB_NAME` | Prod | Default `kura_db` |
| `DB_HOST` | Prod | TCP host, or `/cloudsql/INSTANCE` in Cloud Run |
| `DB_PORT` | No | Default `5432` |
| `DB_SCHEMA` | No | Default `public` |
| `DATABASE_URL` | Auto | Built by `buildDatabaseUrl()` at startup |

## Application / CORS / admin

Brand strings (`APP_NAME`, upgrade URL, demo base) live in [`src/config/brand.ts`](../src/config/brand.ts) — not env. Public app origin is derived from `ALLOWED_ORIGINS`.

| Variable | Required | Notes |
|----------|----------|-------|
| `ALLOWED_ORIGINS` | Prod | Comma-separated CORS origins (**only** source in production); first HTTP origin = app URL |
| `ADMIN_EMAIL` | For admin / fraud mail | Empty deny admin |
| `ADMIN_EMAILS` | No | Comma-separated allowlist; else `ADMIN_EMAIL` |

GitHub inventory: [SECRETS.md](SECRETS.md).

## Email (Resend)

| Variable | Required | Notes |
|----------|----------|-------|
| `RESEND_API_KEY` | Prod | |
| `RESEND_FROM_EMAIL` | Prod | Verified sender |

## Plaid

| Variable | Required | Notes |
|----------|----------|-------|
| `PLAID_CLIENT_ID` | Prod | |
| `PLAID_SANDBOX_SECRET` | Prod | |
| `PLAID_PRODUCTION_SECRET` | Prod | |
| `PLAID_REDIRECT_URI` | Recommended | OAuth redirect |
| `PLAID_WEBHOOK_URL` | Recommended | |
| `PLAID_SANDBOX_USER_IDS` | No | Comma-separated user UUIDs forced to Sandbox |

## Stripe

| Variable | Required | Notes |
|----------|----------|-------|
| `STRIPE_SECRET_KEY` | Prod | |
| `STRIPE_WEBHOOK_SECRET` | Prod | |
| `STRIPE_PRICE_PRO_MONTHLY` | Recommended | Mapped to Pro by `getTierByPriceId` |
| `STRIPE_PRICE_PRO_YEARLY` | Recommended | Mapped to Pro |
| `STRIPE_PRICE_ULTIMATE_MONTHLY` | Recommended | Mapped to Ultimate |
| `STRIPE_PRICE_ULTIMATE_YEARLY` | Recommended | Mapped to Ultimate |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ULTIMATE` | Optional | Legacy aliases (same mapping) |

## DeBank / Logo

| Variable | Required | Notes |
|----------|----------|-------|
| `DEBANK_ACCESS_KEY` | When `FEATURES.debank` | No free public substitute |
| `LOGO_DEV_TOKEN` | No | Optional. When unset, logos use free Google favicons + jsDelivr crypto icons |

See [API_KEYS.md](API_KEYS.md) for partner keys vs free-public inventory.

## Privy

| Variable | Required | Notes |
|----------|----------|-------|
| `PRIVY_APP_ID` | For login | |
| `PRIVY_APP_SECRET` | For login | |
| `PRIVY_VERIFICATION_KEY` | For login | From Privy dashboard |

## WebAuthn / Passkeys

| Variable | Required | Notes |
|----------|----------|-------|
| `WEBAUTHN_RP_ID` | For passkeys | Shared web + mobile RP ID (your API host) |
| `WEBAUTHN_RP_NAME` | For passkeys | Display name |
| `WEBAUTHN_ORIGIN` | For passkeys | Comma-separated allowed origins; may include `android:apk-key-hash:...` |
| `WEBAUTHN_RELATED_ORIGINS` | For web ROR | Origins for `/.well-known/webauthn` (falls back to `ALLOWED_ORIGINS`) |

## Bridge

| Variable | Required | Notes |
|----------|----------|-------|
| `BRIDGE_API_KEY` | Prod | |
| `BRIDGE_WEBHOOK_PUBLIC_KEY` | For webhooks | PEM; use `\n` for newlines in secrets stores |
| `BRIDGE_FEE_CONFIG_ENABLED` | No | Feature flag |
| `BRIDGE_WALLET_ID` | For fiat deposit returns | Bridge Wallet used as return funding source |
| `BRIDGE_WALLET_CURRENCY` | No | Default `usdb` |
| `BRIDGE_FUNDS_REQUESTS_SYNC_MIN_INTERVAL_MS` | No | Default `300000` (5m) lazy poll interval |

## Dinari

| Variable | Required | Notes |
|----------|----------|-------|
| `DINARI_API_KEY_ID` | Prod | |
| `DINARI_API_SECRET_KEY` | Prod | |
| `DINARI_PAYMENT_TOKEN_ADDRESS` | For orders | e.g. USDC |
| `DINARI_ENVIRONMENT` | No | e.g. `sandbox` |
| `DINARI_CHAIN_ID` | No | e.g. `eip155:8453` |
| `DINARI_WHITELIST_EMAILS` | No | Emails and/or `@domain` entries |
| `DINARI_WHITELIST_DOMAINS` | No | Comma-separated domains (no `@` required) |

Without whitelist env vars, only demo emails (`DEMO_USER_EMAILS` / demo helpers) can access Dinari Entity/KYC.

## LI.FI

| Variable | Required | Notes |
|----------|----------|-------|
| `LIFI_API_KEY` | No | Optional rate-limit boost; public `li.quest` works without it |
| `LIFI_INTEGRATOR` | For analytics sync | Integrator **names** (not a secret), comma-separated |

## Mobile associated domains (well-known)

| Variable | Required | Notes |
|----------|----------|-------|
| `APPLE_APP_ID` | For iOS AASA | `TeamID.bundleId` — endpoint 404 if unset |
| `ANDROID_PACKAGE_NAME` | For assetlinks | Endpoint 404 if unset |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | For assetlinks | Comma-separated SHA-256 fingerprints |

## Debug

| Variable | Notes |
|----------|-------|
| `DEBUG_COOKIES` | Set `true` to log cookie debug info |

## GitHub Actions mapping

Production values are injected in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) from GitHub **Variables** (infra / public config) and **Secrets** (credentials). See **[SECRETS.md](SECRETS.md)** for what belongs where and what you can delete.
