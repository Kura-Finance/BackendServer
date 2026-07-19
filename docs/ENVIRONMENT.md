# Environment variables

[繁體中文](ENVIRONMENT.zh-TW.md)

Local development loads `.env.development` when `NODE_ENV` is not `production` and `DB_HOST` is unset (see `src/config/env.ts`). Never commit `.env*` files.

Validation: `validateEnvironment()` runs at boot. Some integrations warn and continue; others exit in production when missing.

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

## Application / CORS / branding

| Variable | Required | Notes |
|----------|----------|-------|
| `ALLOWED_ORIGINS` | Prod | Comma-separated origins |
| `APP_NAME` | No | Default `Kura` |
| `APP_URL` | No | Frontend base URL |
| `APP_UPGRADE_URL` | No | Pricing / upgrade link |
| `ADMIN_EMAIL` | No | Default `admin@kura-finance.com` |
| `SUPPORT_EMAIL` | No | Default `Support@kura-finance.com` |

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
| `STRIPE_PRICE_PRO_MONTHLY` | Recommended | Price IDs |
| `STRIPE_PRICE_PRO_YEARLY` | Recommended | |
| `STRIPE_PRICE_ULTIMATE_MONTHLY` | Recommended | |
| `STRIPE_PRICE_ULTIMATE_YEARLY` | Recommended | |

## DeBank / Logo

| Variable | Required | Notes |
|----------|----------|-------|
| `DEBANK_ACCESS_KEY` | Prod | |
| `LOGO_DEV_TOKEN` | No | Logo.dev publishable key |

## Privy

| Variable | Required | Notes |
|----------|----------|-------|
| `PRIVY_APP_ID` | For login | |
| `PRIVY_APP_SECRET` | For login | |
| `PRIVY_VERIFICATION_KEY` | For login | From Privy dashboard |

## WebAuthn / Passkeys

| Variable | Required | Notes |
|----------|----------|-------|
| `WEBAUTHN_RP_ID` | For passkeys | e.g. `api.kura-finance.com` |
| `WEBAUTHN_RP_NAME` | For passkeys | e.g. `Kura` |
| `WEBAUTHN_ORIGIN` | For passkeys | Comma-separated; may include `android:apk-key-hash:...` |

## Bridge

| Variable | Required | Notes |
|----------|----------|-------|
| `BRIDGE_API_KEY` | Prod | |
| `BRIDGE_WEBHOOK_PUBLIC_KEY` | For webhooks | PEM; use `\n` for newlines in secrets stores |
| `BRIDGE_FEE_CONFIG_ENABLED` | No | Feature flag |

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
| `LIFI_API_KEY` | Recommended | |
| `LIFI_INTEGRATOR` | For analytics sync | Comma-separated integrator names |

## Mobile associated domains (well-known)

| Variable | Required | Notes |
|----------|----------|-------|
| `APPLE_APP_ID` | No | Default `K7FVP5GGP9.com.kurafinance.app` |
| `ANDROID_PACKAGE_NAME` | No | Default `com.kurafinance.app` |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | No | Comma-separated; defaults to current Kura certs |

## Debug

| Variable | Notes |
|----------|-------|
| `DEBUG_COOKIES` | Set `true` to log cookie debug info |

## GitHub Actions mapping

Production values are injected in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) from GitHub **Secrets** and **Variables**. Optional vars include `ADMIN_EMAIL`, `SUPPORT_EMAIL`, `PLAID_SANDBOX_USER_IDS`, `DINARI_WHITELIST_*`, and mobile well-known overrides.
