# Operations

[繁體中文](OPERATIONS.zh-TW.md)

## Local development

1. Install Node.js 24+.
2. Create PostgreSQL database (e.g. `kura_db`).
3. Copy the env template and fill secrets:

```bash
cp .env.example .env.development
```

   Set at least `JWT_SECRET`, `ENCRYPTION_KEY`, DB vars, and partner keys for domains enabled in [`src/config/features.ts`](../src/config/features.ts) (see [ENVIRONMENT.md](ENVIRONMENT.md)).
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

1. Authenticate to GCP (`GCP_SA_KEY` secret).
2. Run `prisma migrate deploy` through Cloud SQL Auth Proxy (`CLOUD_SQL_INSTANCE` variable; `DB_PASSWORD` read from Secret Manager).
3. Build and push image to `gcr.io/$PROJECT_ID/$CLOUD_RUN_SERVICE`.
4. Deploy the image to Cloud Run with the Cloud SQL attachment and Secret Manager bindings. Runtime config already on the service is kept.

### GitHub Variables (where to deploy)

| Variable | Example |
|----------|---------|
| `GCP_PROJECT_ID` | GCP project id |
| `GCP_REGION` | `us-central1` |
| `CLOUD_RUN_SERVICE` | `kura-backend` |
| `CLOUD_SQL_INSTANCE` | `PROJECT:REGION:INSTANCE` |
| `DB_USER` / `DB_NAME` / `DB_SCHEMA` | DB connection |

Credentials live in Secret Manager and runtime config on the Cloud Run service — see **[SECRETS.md](SECRETS.md)**. Full variable catalog: [ENVIRONMENT.md](ENVIRONMENT.md).

## Moving to another GCP project (e.g. "No organization")

A project cannot be moved out of an organization. To relocate the stack, back
it up and rebuild it with the scripts in
[`infra/gcp-migration/`](../infra/gcp-migration/README.md): SQL export/import,
image copy into a `gcr.io`-compatible Artifact Registry repo, Cloud Run redeploy
with the exported env vars, a new deploy service account, and a helper that
repoints the GitHub Variables/Secrets. The deploy workflow itself needs no
change — only `GCP_PROJECT_ID`, `CLOUD_SQL_INSTANCE` and `GCP_SA_KEY`.

## Migrations

- Author migrations with `npx prisma migrate dev --name <name>` in development.
- Production applies with `npx prisma migrate deploy` (CI does this before deploy).
- Never edit applied migrations; add a new migration instead.
- Schema: `prisma/schema.prisma`. Optional DBML output is gitignored under `prisma/dbml/`.

## Logging

Winston-based logging under `src/domains/logger/`. Daily rotate file transport may write under `logs/` (gitignored). On Cloud Run, rely on stdout/stderr → Cloud Logging.

## Health and scaling

- Liveness: `GET /health` (includes `features` snapshot)
- Cloud Run defaults in workflow: 512Mi RAM, 1 CPU, 3600s timeout, unauthenticated ingress (API still requires app auth on protected routes).
- Adjust memory/CPU in the deploy workflow flags if sync-heavy workloads grow.

## Secrets rotation

Rotate via partner dashboards, then update GitHub Secrets / Variables and redeploy.

Bridge webhook PEM: store the full PEM in `BRIDGE_WEBHOOK_PUBLIC_KEY`. If the secret store flattens newlines, use literal `\n`; the server normalizes them at read time.
