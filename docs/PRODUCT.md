# Product overview

[繁體中文](PRODUCT.zh-TW.md)

**Kura** is a multi-asset personal finance application. This repository is the **backend API** owned by **Prism Capital LLC**.

## What it does

| Area | Capability |
|------|------------|
| Auth | Privy identity, app JWT session, WebAuthn/passkeys, referrals / cashback |
| Banking | Plaid link, transactions, investment accounts |
| Crypto | DeBank portfolios, CCXT exchanges, personal SCA wallet, **Treasury** Safes (Pro/Ultimate) |
| Markets | Asset aggregation, Yahoo Finance helpers |
| On/off-ramp | Bridge KYC, transfers, virtual accounts, webhooks |
| Tokenized stocks | Dinari entities, accounts, orders |
| Billing | Stripe subscriptions (Basic / Pro / Ultimate); webhooks drive tier |
| Platform | Waitlist, investor insights, Privy / LI.FI analytics |

## Stack

- Node.js 24, TypeScript, Express 5
- Prisma + PostgreSQL (Cloud SQL in production)
- Deploy: GitHub Actions → Google Cloud Run

## Related docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — internal structure
- [API.md](API.md) — HTTP surface
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — how to contribute
