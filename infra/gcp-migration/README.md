# GCP migration: back up and rebuild under "No organization"

[繁體中文](README.zh-TW.md)

Scripts to copy the hosted Kura stack out of the organization-owned Google
Cloud project and rebuild it, byte-for-byte, in a fresh project that has **no
organization parent**. A project can never be *moved* out of an organization to
"No organization", so the only route is back up → recreate → cut over.

What lives in GCP (and gets migrated):

| Resource | Source of truth | Migrated by |
|----------|-----------------|-------------|
| Cloud Run `kura-backend` (this repo) | `.github/workflows/deploy.yml` | image copy + redeploy with the exported env vars |
| Cloud Run `app` (WebClients) | `WebClients/.github/workflows/deploy.yml` | same |
| Cloud SQL PostgreSQL (`kura_db`) | Prisma migrations | `gcloud sql export` → `gcloud sql import` |
| Container images (`gcr.io/<project>/…`) | CI builds | registry-to-registry copy into an Artifact Registry repo named `gcr.io` |
| IAM, service accounts, domain mappings | — | new deploy SA + key; domain mappings recreated on request |

Not in GCP, nothing to migrate: LandingPage (Cloudflare Pages), mobile-app
(Expo / app stores), Privy, Stripe, Plaid, Bridge, Dinari, Resend.

## Prerequisites

| Need | Why |
|------|-----|
| `gcloud` (SDK ≥ 450) with `beta` component | everything |
| `python3` | JSON rewriting (stdlib only) |
| `docker` **or** [`crane`](https://github.com/google/go-containerregistry) | copying images between projects |
| `gh` (optional) | `40-github-config.sh` |
| Owner on the **source** project | export SQL, read Cloud Run env vars |
| A **consumer Google account** (gmail.com) or an account whose org allows it | only such accounts can create projects with no organization parent |
| A billing account that account can use | Cloud SQL and Cloud Run are billed |

Both accounts can be the same `gcloud` login if that identity has Owner on the
old project *and* can create no-org projects. Otherwise run `10-backup.sh`
logged in as the org account and `20-rebuild.sh` logged in as the personal
account (the backup folder is the hand-off).

## Run

```bash
cd infra/gcp-migration
cp config.env.example config.env     # fill SRC_PROJECT_ID, DST_PROJECT_ID, BILLING_ACCOUNT_ID, DB_PASSWORD …
./00-preflight.sh                     # read-only: tooling, auth, what exists
./10-backup.sh                        # → backups/<timestamp>/ (+ SQL dump in GCS)
./20-rebuild.sh                       # new project, APIs, registry, SQL, images, Cloud Run, deploy SA
./30-verify.sh                        # /health, env-var diff, SQL, billing
./40-github-config.sh                 # update GitHub Variables/Secrets on both repos
```

`20-rebuild.sh` is idempotent; re-run it after fixing a failure, or restrict it:

```bash
./20-rebuild.sh --only sql,run        # steps: project,apis,registry,sql,images,run,deploy-sa,domains
./20-rebuild.sh --yes                 # skip confirmations
```

### What `10-backup.sh` writes

```
backups/<ts>/
  manifest.json              source project, time, account
  project/                   project.json, enabled-services, iam-policy, service-accounts
  run/                       <service>.json/.yaml (full spec incl. env vars), .iam.json, revisions, domain mappings
  sql/                       instance/db/user metadata, <instance>-<db>.sql.gz (pg_dump via serverless export)
  images/                    running-images.txt (service → image → digest), optional <service>.tar
  secrets/ misc/             Secret Manager payloads, Scheduler, DNS zones, buckets (inventory)
```

> **This folder holds production secrets** (`JWT_SECRET`, `DB_PASSWORD`,
> partner keys, the SA key under `dst/`). It is gitignored and `chmod 700`.
> Encrypt it before storing it anywhere shared, and delete it when the
> migration is confirmed.

### What `20-rebuild.sh` does, step by step

1. **project** – `gcloud projects create` with no `--organization`/`--folder`, then links billing. Warns if the created project still got a parent (your account's org forces it; use a gmail.com account instead).
2. **apis** – Run, SQL Admin, Artifact Registry, Container Registry (for `gcr.io` redirect), Cloud Build, IAM, Secret Manager, Logging.
3. **registry** – Artifact Registry Docker repository literally named `gcr.io` in the `us` multi-region, so `gcr.io/<new-project>/…` resolves and **both deploy workflows keep working with just the project id changed**.
4. **sql** – creates the instance with the source's engine version, tier, edition and availability type (override `DST_SQL_TIER`), creates `DB_NAME`, sets `DB_USER` password, recreates any extra roles the dump references, uploads the dump to a bucket in the new project and imports it as `postgres`. The `_prisma_migrations` table comes along, so the next CI `prisma migrate deploy` is a no-op.
5. **images** – copies the exact image each service is running (`crane copy`, else `docker pull/push`, else `docker load` from the saved tar) and tags it `:latest`.
6. **run** – `gcloud run deploy` per service with the exported env vars via `--env-vars-file` (comma- and newline-safe), memory/CPU/timeout/concurrency/scale flags carried over, `DB_HOST` and the Cloud SQL attachment rewritten to the new connection name, `DB_PASSWORD` replaced from `config.env`, and `allUsers → run.invoker` restored where the source was public.
7. **deploy-sa** – `github-deploy@<new>.iam.gserviceaccount.com` with `run.admin`, `iam.serviceAccountUser`, `cloudsql.client`, `artifactregistry.writer`, `storage.objectAdmin`; writes a JSON key to `backups/<ts>/dst/`.
8. **domains** – optional `DOMAINS="api.example.com=kura-backend app.example.com=app"`; prints the DNS records to set. The domain must be verified by the account running the script (`gcloud domains verify`).

## Cut-over checklist

- [ ] `30-verify.sh` green; `GET /health` on the new backend shows the expected `features`.
- [ ] `40-github-config.sh` run; a push to `main` deploys to the new project (watch the Actions run).
- [ ] DNS: point `api.` / `app.` records at the new domain mappings (or keep the Cloud Run URLs if you are dropping the custom domains). Cloudflare: DNS-only until the managed certificate is issued.
- [ ] Webhook URLs at Stripe, Plaid, Bridge still resolve (unchanged if the hostnames stay the same).
- [ ] WebAuthn RP ID / origins and Privy allowed origins unchanged (same hostnames) — if you change hostnames, update `WEBAUTHN_*`, `ALLOWED_ORIGINS` and the web build args too.
- [ ] Old project: set Cloud Run `--max-instances=0` or delete the services, keep Cloud SQL stopped for a grace period, revoke the old deploy key, then `gcloud projects delete <old>`.

## Recovery without the scripts

The backup folder is plain `gcloud` output, so everything can be replayed by hand:

```bash
gcloud sql import sql NEW_INSTANCE gs://BUCKET/x.sql.gz --database kura_db --user postgres
gcloud run services replace backups/<ts>/run/kura-backend.yaml --region us-central1 --project NEW   # after editing image/project refs
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `projects create` → project has a parent | Account is in a Workspace/Cloud Identity org. Create the project from a gmail.com account (and add the org account as Owner afterwards if you like). |
| `sql export` → `PERMISSION_DENIED` on bucket | The script grants the instance SA `objectAdmin`; wait a minute for IAM propagation and re-run. |
| `sql import` → `role "x" does not exist` | The dump references a DB role; the script recreates users from `sql/<instance>.users.json`. Create the missing one with `gcloud sql users create` and re-run `--only sql` after deleting `dst/sql-imported.*`. |
| `run deploy` → image pull failed | `registry` step grants the compute SA reader on `gcr.io`; confirm `gcloud container images list --repository gcr.io/NEW`. |
| Service boots but DB errors | `DB_HOST` must be `/cloudsql/NEW:REGION:INSTANCE`; check `backups/<ts>/dst/<service>.env.yaml`. |
| Workflow pushes to `gcr.io/NEW/...` fail | `gcr.io` Artifact Registry repo missing or deploy SA lacks `artifactregistry.writer`; re-run `--only registry,deploy-sa`. |
