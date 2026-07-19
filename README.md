# Kura Backend

Backend API for **Kura**, a multi-asset finance application owned by **Kura Finance LLC**.

Stack: Node.js 24, TypeScript, Express 5, Prisma, PostgreSQL. Production deploy targets Google Cloud Run with Cloud SQL.

[繁體中文](README.zh-TW.md)

## License

Proprietary. Copyright © 2024–2026 Kura Finance LLC. See [LICENSE](LICENSE) (authoritative) and [LICENSE.zh-TW.md](LICENSE.zh-TW.md) (Chinese courtesy translation).

Third-party open-source dependencies are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) / [THIRD_PARTY_NOTICES.zh-TW.md](THIRD_PARTY_NOTICES.zh-TW.md).

## Documentation

| Document | Description | 中文 |
|----------|-------------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Domains, auth, data flows | [zh-TW](docs/ARCHITECTURE.zh-TW.md) |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Environment variable catalog | [zh-TW](docs/ENVIRONMENT.zh-TW.md) |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Local run, Docker, Cloud Run, migrations | [zh-TW](docs/OPERATIONS.zh-TW.md) |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Sale / transfer checklist | [zh-TW](docs/HANDOFF.zh-TW.md) |

## Quick start (local)

Prerequisites: Node.js 24+, PostgreSQL, and a `.env.development` file (see [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)).

```bash
npm ci
npx prisma migrate deploy   # or: npx prisma migrate dev
npm run dev
```

Health check: `GET http://localhost:8080/health`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with reload (`ts-node-dev`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run dbml` | Regenerate Prisma client / DBML |

## API surface (high level)

| Mount | Domain |
|-------|--------|
| `/api/auth` | Auth, Privy, passkeys, referrals |
| `/api/plaid` | Bank linking (Plaid) |
| `/api/assets` | Asset aggregation |
| `/api/exchange` | CEX via CCXT |
| `/api/debank` | On-chain wallets (DeBank) |
| `/api/stripe` | Subscriptions |
| `/api/wallet` | Wallet / E2EE-related |
| `/api/bridge` | On/off-ramp (Bridge) |
| `/api/dinari` | Tokenized stocks (Dinari) |
| `/api/notifications` | Notifications |
| `/api/waitlist` | Waitlist |
| `/api/platform-insights` | Platform analytics |
| `/api/privy-analytics` | Privy analytics |
| `/api/lifi-analytics` | LI.FI analytics |
| `/.well-known/*` | Apple / Android associated domains |
| `/health` | Liveness |

## Copyright

Copyright © 2024–2026 Kura Finance LLC. All rights reserved.
