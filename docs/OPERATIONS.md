# Operations

[繁體中文](OPERATIONS.zh-TW.md)

## Local development

1. Install Node.js 24+.
2. Create PostgreSQL database (e.g. `kura_db`).
3. Create `.env.development` with at least `JWT_SECRET`, `ENCRYPTION_KEY`, DB vars, and partner keys you need (see [ENVIRONMENT.md](ENVIRONMENT.md)).
4. Install and migrate:

```bash
npm ci
npx prisma migrate deploy
npm run dev
```

5. Verify: `curl -s http://localhost:8080/health`

Prisma client is generated automatically via the `predev` script.

## Docker

Multi-stage build: Node 24 Alpine, compiles TypeScript, runs `node dist/index.js` under `dumb-init`.

```bash
docker build -t kura-backend .
docker run --env-file .env.production -p 8080:8080 kura-backend
```

Provide all production env vars at runtime; the image does not bake secrets.

## Production deploy (canonical)

**Source of truth:** [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

On push to `main` or `develop`:

1. Authenticate to GCP (`GCP_SA_KEY`).
2. Run `prisma migrate deploy` through Cloud SQL Auth Proxy against instance `kura-492622:us-central1:kura-postgres`.
3. Build and push image to `gcr.io/$PROJECT_ID/kura-backend`.
4. Deploy to Cloud Run service `kura-backend` in `us-central1` with Cloud SQL attachment.

### Legacy files (do not use as primary)

| File | Status |
|------|--------|
| `cloudbuild.yaml` | Stale; references missing `k8s/` manifests |
| `app.yaml` | App Engine stub; env names may be outdated |

Prefer GitHub Actions → Cloud Run for all production changes.

## Migrations

- Author migrations with `npx prisma migrate dev --name <name>` in development.
- Production applies with `npx prisma migrate deploy` (CI does this before deploy).
- Never edit applied migrations; add a new migration instead.
- Schema: `prisma/schema.prisma`. Optional DBML output is gitignored under `prisma/dbml/`.

## Logging

Winston-based logging under `src/domains/logger/`. Daily rotate file transport may write under `logs/` (gitignored). On Cloud Run, rely on stdout/stderr → Cloud Logging.

## Health and scaling

- Liveness: `GET /health`
- Cloud Run defaults in workflow: 512Mi RAM, 1 CPU, 3600s timeout, unauthenticated ingress (API still requires app auth on protected routes).
- Adjust memory/CPU in the deploy workflow flags if sync-heavy workloads grow.

## Secrets rotation

Rotate via partner dashboards, then update GitHub Secrets and redeploy. After transfer, revoke seller-held keys (see [HANDOFF.md](HANDOFF.md)).

Bridge webhook PEM: store the full PEM in `BRIDGE_WEBHOOK_PUBLIC_KEY`. If the secret store flattens newlines, use literal `\n`; the server normalizes them at read time.
