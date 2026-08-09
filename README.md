# Kura Backend

Open-source backend API for **Kura** — a multi-asset finance application.

Stack: Node.js 24, TypeScript, Express 5, Prisma, PostgreSQL. Deploy target: Google Cloud Run + Cloud SQL (optional).

[繁體中文](README.zh-TW.md) · [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE) · Copyright © 2024–2026 Kura Finance LLC

Third-party notices: [docs/legal/THIRD_PARTY_NOTICES.md](docs/legal/THIRD_PARTY_NOTICES.md)

## Documentation

Full index: **[docs/README.md](docs/README.md)**

| Doc | Description |
|-----|-------------|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Product overview |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Domains, auth, data flows |
| [docs/API.md](docs/API.md) | HTTP mounts and access rules |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Environment variables |
| [.env.example](.env.example) | Env template |
| [src/config/features.ts](src/config/features.ts) | Domain feature toggles |
| [docs/API_KEYS.md](docs/API_KEYS.md) | Partner keys vs free public endpoints |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Local / Docker / Cloud Run |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model |

## Quick start

Prerequisites: Node.js 24+, PostgreSQL.

```bash
cp .env.example .env.development
# Enable only the domains you need in src/config/features.ts
# Fill JWT_SECRET, ENCRYPTION_KEY, DB_*, and partner keys for enabled features

npm ci
npx prisma migrate deploy   # or: npx prisma migrate dev
npm run dev
```

Health: `GET http://localhost:8080/health` · Features: `GET http://localhost:8080/api/features`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with reload (`ts-node-dev`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run dbml` | Regenerate Prisma client / DBML |
