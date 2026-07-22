# Sale / transfer handoff checklist

[繁體中文](HANDOFF.zh-TW.md)

Product: **Kura**  
Legal entity: **Kura Finance LLC**  
Repository: BackendServer (this codebase)

Use this checklist during asset purchase diligence and day-of cutover. Legal assignment of IP should be covered in the purchase agreement (SPA); this repo provides proprietary source under [LICENSE](../LICENSE).

## 1. Intellectual property

- [ ] Confirm SPA assigns copyright in this repository to buyer (or grants exclusive license as negotiated).
- [ ] Confirm contractor/employee IP assignment for authors (`rick-kura-dev` / `chaindevrick` and any others).
- [ ] Review [legal/THIRD_PARTY_NOTICES.md](legal/THIRD_PARTY_NOTICES.md); dependency licenses are permissive (no known copyleft blockers).
- [ ] Note: local backup branches related to history rewrite may exist for diligence only—do not treat them as release artifacts.
- [ ] Share [data-room/README.md](data-room/README.md) as the buyer-facing index (no secrets).

## 2. Source & CI

- [ ] Transfer or fork GitHub org/repo (`Kura-Finance/BackendServer` or successor).
- [ ] Transfer GitHub Actions secrets/variables (list below) or recreate in buyer’s org.
- [ ] Update deploy workflow project/instance names if buyer uses a new GCP project.
- [ ] Ensure `BRIDGE_WEBHOOK_PUBLIC_KEY` is set in production (hardcoded fallback removed).

## 3. Google Cloud

Current production identifiers (rebrand or transfer as agreed):

| Item | Current value |
|------|----------------|
| Cloud Run service | `kura-backend` |
| Region | `us-central1` |
| Cloud SQL instance | `kura-492622:us-central1:kura-postgres` |
| DB user / name | `kura_user` / `kura_db` |

- [ ] Transfer GCP project ownership **or** provision new project and migrate DB.
- [ ] Rotate `GCP_SA_KEY` after transfer; revoke seller access.
- [ ] Export / migrate Cloud SQL; verify `prisma migrate deploy` on target.
- [ ] Update DNS for `api.kura-finance.com` (or buyer domain) → Cloud Run.

## 4. Partner accounts (credentials + webhooks)

Transfer ownership or create buyer accounts and cut over env vars:

| Partner | Secrets / config | Notes |
|---------|------------------|-------|
| Privy | `PRIVY_*` | App ownership + allowed origins |
| Plaid | `PLAID_*` | Redirect URI, webhook URL, sandbox vs production |
| Stripe | `STRIPE_*` + price IDs | Webhook endpoint to API |
| Bridge | `BRIDGE_API_KEY`, `BRIDGE_WEBHOOK_PUBLIC_KEY` | Re-register webhook; copy new PEM |
| Dinari | `DINARI_*` | Whitelist domains/emails via env |
| DeBank | `DEBANK_ACCESS_KEY` | |
| Resend | `RESEND_*` | Verify sending domain |
| LI.FI | `LIFI_API_KEY`, `LIFI_INTEGRATOR` | Integrator name may stay `kura` or change |
| Logo.dev | `LOGO_DEV_TOKEN` | |

- [ ] Point all partner webhooks at the post-cutover API hostname.
- [ ] Revoke seller API keys after buyer keys are live.

## 5. Domains, email, mobile

- [ ] Domains: `kura-finance.com`, `api.`, `app.`, `demo.` as applicable.
- [ ] Mailboxes: set `ADMIN_EMAIL` / `SUPPORT_EMAIL` (or keep defaults).
- [ ] Apple: Team ID + bundle → `APPLE_APP_ID`; Associated Domains on API host.
- [ ] Android: `ANDROID_PACKAGE_NAME` + `ANDROID_SHA256_CERT_FINGERPRINTS`; Digital Asset Links.
- [ ] WebAuthn: `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` must match live API and app hashes.

## 6. Data & compliance

- [ ] Agree DB snapshot scope (users, linked accounts, KYC state, billing).
- [ ] Confirm PII / financial data handling obligations under SPA.
- [ ] Rotate `JWT_SECRET` and `ENCRYPTION_KEY` only with a planned invalidation of sessions / re-encrypt strategy (coordinate with mobile/web clients).

## 7. Post-cutover smoke test

- [ ] `GET /health` on production.
- [ ] Privy login → JWT session.
- [ ] Passkey register/auth on iOS and Android.
- [ ] Plaid link (sandbox user IDs via `PLAID_SANDBOX_USER_IDS` if needed).
- [ ] Stripe checkout / webhook.
- [ ] Bridge webhook signature accepts events.
- [ ] Dinari whitelist still admits intended operators.

## 8. GitHub Secrets / Variables inventory

**Secrets (typical):**  
`GCP_PROJECT_ID`, `GCP_SA_KEY`, `DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`, `PLAID_CLIENT_ID`, `PLAID_PRODUCTION_SECRET`, `PLAID_REDIRECT_URI`, `PLAID_WEBHOOK_URL`, `LOGO_DEV_PUBLISHABLE_KEY`, `ALLOWED_ORIGINS`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_NAME`, `APP_URL`, `DEBANK_ACCESS_KEY`, `STRIPE_*`, `BRIDGE_API_KEY`, `BRIDGE_WEBHOOK_PUBLIC_KEY`, `DINARI_API_KEY_ID`, `DINARI_API_SECRET_KEY`, `PRIVY_*`, `LIFI_API_KEY`.

**Variables (optional):**  
`BRIDGE_FEE_CONFIG_ENABLED`, `ADMIN_EMAIL`, `SUPPORT_EMAIL`, `PLAID_SANDBOX_USER_IDS`, `DINARI_WHITELIST_DOMAINS`, `DINARI_WHITELIST_EMAILS`, `APPLE_APP_ID`, `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_CERT_FINGERPRINTS`.

If Dinari whitelist previously relied on the removed builtin domain `theprism.ltd`, set `DINARI_WHITELIST_DOMAINS=theprism.ltd` (or buyer equivalent) before deploy.
