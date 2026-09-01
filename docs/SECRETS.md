# Secrets & Variables (functional only)

[繁體中文](SECRETS.zh-TW.md)

Aligns with [`src/config/features.ts`](../src/config/features.ts) and [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

**Rules**
- **Secrets** = credentials that grant access.
- **Variables** = non-secret config (URLs, public keys, IDs).
- **Not env:** product name / upgrade / demo branding — see `src/config/brand.ts` (code constants; app URL derived from `ALLOWED_ORIGINS`).

## Core Secrets (always)

| Name | Used by |
|------|---------|
| `GCP_SA_KEY` | Deploy |
| `DB_PASSWORD` | Postgres |
| `JWT_SECRET` | Auth sessions |
| `ENCRYPTION_KEY` | Server crypto |
| `PRIVY_APP_ID` | Auth / Privy |
| `PRIVY_APP_SECRET` | Auth / Privy |
| `PRIVY_VERIFICATION_KEY` | Auth / Privy |

## Core Variables (always)

| Name | Used by |
|------|---------|
| `GCP_PROJECT_ID` | Deploy |
| `GCP_REGION` | Deploy |
| `CLOUD_RUN_SERVICE` | Deploy |
| `CLOUD_SQL_INSTANCE` | Deploy + `DB_HOST` |
| `DB_USER` / `DB_NAME` / `DB_SCHEMA` | Postgres |
| `ALLOWED_ORIGINS` | CORS (+ derives public app URL in code) |
| `ADMIN_EMAIL` | Admin allowlist / fraud mail (`FEATURES.admin`) |
| `WEBAUTHN_RP_ID` | Passkeys |
| `WEBAUTHN_RP_NAME` | Passkeys |
| `WEBAUTHN_ORIGIN` | Passkeys |
| `WEBAUTHN_RELATED_ORIGINS` | `/.well-known/webauthn` |
| `APPLE_APP_ID` | iOS AASA (optional) |
| `ANDROID_PACKAGE_NAME` | Android assetlinks (optional) |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | Android assetlinks (optional) |

## Domain Secrets — only when `FEATURES.* === true`

| Feature | Secrets |
|---------|---------|
| `email` | `RESEND_API_KEY` |
| `plaid` | `PLAID_CLIENT_ID`, `PLAID_PRODUCTION_SECRET` (+ `PLAID_SANDBOX_SECRET` if used) |
| `stripe` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `debank` | `DEBANK_ACCESS_KEY` |
| `bridge` | `BRIDGE_API_KEY` |
| `dinari` | `DINARI_API_KEY_ID`, `DINARI_API_SECRET_KEY` |
| `lifiAnalytics` | `LIFI_API_KEY` (optional rate limit) |

## Domain Variables — only when feature on

| Feature | Variables |
|---------|-----------|
| `email` | `RESEND_FROM_EMAIL` |
| `plaid` | `PLAID_REDIRECT_URI`, `PLAID_WEBHOOK_URL` |
| `stripe` | `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_ULTIMATE_MONTHLY`, `STRIPE_PRICE_ULTIMATE_YEARLY` |
| `bridge` | `BRIDGE_WEBHOOK_PUBLIC_KEY` (public PEM), optional `BRIDGE_WALLET_ID` |
| `dinari` | `DINARI_ENVIRONMENT`, `DINARI_CHAIN_ID`, optional whitelist |
| `lifiAnalytics` | `LIFI_INTEGRATOR` |

Enable a domain in `features.ts`, then add matching `env_vars` lines in `deploy.yml` (checklist in the workflow comments).

## Delete from GitHub (not needed)

| Name | Why |
|------|-----|
| `APP_NAME` | Brand — hardcoded in `brand.ts` |
| `APP_URL` | Derived from `ALLOWED_ORIGINS` |
| `APP_UPGRADE_URL` | Derived `{origin}/pricing` |
| `DEMO_BASE_URL` | Same as app origin |
| `SUPPORT_EMAIL` | Uses `ADMIN_EMAIL` |
| `LOGO_DEV_*` | Free public logos; not injected |
| Partner keys for `FEATURES.* === false` | Domain unmounted |
| `DATABASE_URL` | Built at boot from `DB_*` |
| `DIDIT_*` / `GNOSIS_PAY_*` / `LITHIC_*` | Removed domains; not referenced |
| Anything above stored as Secret that belongs in Variables | Move, then delete Secret copy |

Domains with no partner keys (`exchange`, `notifications`, `wallet`, `treasury`, `waitlist`, `platformInsights`, `admin`): no extra Secrets beyond core + `ADMIN_EMAIL` for admin.
