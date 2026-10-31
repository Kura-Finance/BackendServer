# Secrets & configuration (functional only)

[繁體中文](SECRETS.zh-TW.md)

Aligns with [`src/config/features.ts`](../src/config/features.ts) and [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

## Where each kind of value lives

| Kind | Store | Examples |
|------|-------|----------|
| Deploy identity | GitHub **Secret** | `GCP_SA_KEY` (only GitHub Secret needed) |
| Where to deploy | GitHub **Variables** | `GCP_PROJECT_ID`, `GCP_REGION`, `CLOUD_RUN_SERVICE`, `CLOUD_SQL_INSTANCE`, `DB_USER`, `DB_NAME`, `DB_SCHEMA` |
| Credentials | **Google Secret Manager** (same project as Cloud Run) | everything in the table below |
| Runtime config | **Cloud Run service env vars** | `ALLOWED_ORIGINS`, `WEBAUTHN_*`, `ADMIN_EMAIL`, `RESEND_FROM_EMAIL`, `PLAID_*_URI/URL`, `STRIPE_PRICE_*`, `DINARI_ENVIRONMENT`, `DINARI_CHAIN_ID`, `LIFI_INTEGRATOR`, mobile well-known vars |
| Brand strings | code | `src/config/brand.ts` |

The deploy workflow only builds the image, runs migrations, and swaps the image. `gcloud run deploy --image` keeps the service's env vars and secret bindings, so runtime config is edited on the service, not in GitHub:

```bash
gcloud run services update kura-backend --region us-central1 --project PROJECT \
  --update-env-vars ALLOWED_ORIGINS=https://app.example.com,WEBAUTHN_RP_ID=api.example.com
```

(Comma-separated values: use `--env-vars-file` or `^;^` delimiter syntax.)

## Secret Manager secrets (secret name = env var name)

Bound by `secrets:` in the deploy workflow. Create them once with `infra/gcp-migration/50-secret-manager.sh` (reads a running service) or by hand:

```bash
printf '%s' 'VALUE' | gcloud secrets create JWT_SECRET --data-file=- --replication-policy=automatic
```

| Always | Per feature (`FEATURES.*`) |
|--------|----------------------------|
| `DB_PASSWORD` | `email`: `RESEND_API_KEY` |
| `JWT_SECRET` | `plaid`: `PLAID_CLIENT_ID`, `PLAID_SANDBOX_SECRET`, `PLAID_PRODUCTION_SECRET` |
| `ENCRYPTION_KEY` | `debank`: `DEBANK_ACCESS_KEY` |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | `stripe`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| optional `PRIVY_VERIFICATION_KEY` (PEM; JWKS fetched when unset) | `bridge`: `BRIDGE_API_KEY`, `BRIDGE_WEBHOOK_PUBLIC_KEY` (PEM, multi-line safe here) |
| optional `LOGO_DEV_TOKEN` | `dinari`: `DINARI_API_KEY_ID`, `DINARI_API_SECRET_KEY` |
| | `lifiAnalytics`: optional `LIFI_API_KEY` |

The Cloud Run runtime service account and the deploy service account need `roles/secretmanager.secretAccessor`.

Disable a domain in `features.ts` → remove its lines from `secrets:` in the workflow (the secret itself can stay).

## Delete from GitHub (no longer read)

Every Secret except `GCP_SA_KEY`, and every Variable except the "where to deploy" set above. In particular: `DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`, `PRIVY_*`, partner keys, `ALLOWED_ORIGINS`, `WEBAUTHN_*`, `STRIPE_PRICE_*`, `APP_*`, `DATABASE_URL`, `DIDIT_*`, `GNOSIS_PAY_*`, `LITHIC_*`, `CODEGO_*`, `MAILERSEND_*`.

## Delete from the Cloud Run service (no code reads them)

`ADMIN_SECRET_KEY`, `APP_NAME`, `APP_URL`, `BACKEND_USE_HTTPS`, `PLAID_SECRET`, `WEB3AUTH_AUDIENCE`, `JWT_RS256_*`, `CODEGO_*`, `DIDIT_*`, `GNOSIS_PAY_*`, `LITHIC_*`, `MAILERSEND_*`, and any key that is not a valid identifier (fragments of a split PEM or CSV). `50-secret-manager.sh` removes these.
