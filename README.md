# Kura Backend

Backend API for **Kura**, a multi-asset finance application owned by **Kura Finance LLC**.

Stack: Node.js 24, TypeScript, Express 5, Prisma, PostgreSQL. Production deploy targets Google Cloud Run with Cloud SQL.

[繁體中文](README.zh-TW.md)

## License

Proprietary. Copyright © 2024–2026 Kura Finance LLC. See [LICENSE](LICENSE) (authoritative) and [docs/legal/LICENSE.zh-TW.md](docs/legal/LICENSE.zh-TW.md) (Chinese courtesy translation).

Third-party notices: [docs/legal/THIRD_PARTY_NOTICES.md](docs/legal/THIRD_PARTY_NOTICES.md).

## Documentation

Full index: **[docs/README.md](docs/README.md)**

| Doc | Description |
|-----|-------------|
| [docs/data-room/README.md](docs/data-room/README.md) | **Sale Data Room** (buyer diligence package) |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Product overview |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Domains, auth, data flows |
| [docs/API.md](docs/API.md) | HTTP mounts and access rules |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Environment variables |
| [.env.example](.env.example) | Env template for local / open-source setup |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Local / Docker / Cloud Run |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Sale / transfer checklist |

## Quick start (local)

Prerequisites: Node.js 24+, PostgreSQL.

```bash
cp .env.example .env.development   # fill in secrets — see docs/ENVIRONMENT.md
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

## Copyright

Copyright © 2024–2026 Kura Finance LLC. All rights reserved.
