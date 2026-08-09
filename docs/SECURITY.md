# Security overview

[繁體中文](SECURITY.zh-TW.md)

High-level security model for diligence. Not a penetration-test report.

## Identity & sessions

- **Privy** verifies end-user identity; this API issues its own **JWT** session (`JWT_SECRET`).
- **WebAuthn / passkeys** unlock client-side E2EE material; RP ID / origins are env-configured.
- Rate limits on `/api/auth` and general `/api/*`.

## Encryption

- Client-side E2EE for sensitive financial payloads where designed; server may store ciphertext + wrapped keys.
- `ENCRYPTION_KEY` (64 hex chars) for server-side crypto that requires it — treat as critical secret.
- Passkey-wrapped DEKs stored per credential; backend cannot recover user plaintext without client unlock flow.

## Subscription access control

- Stripe webhooks update `User.tier` (`Basic` | `Pro` | `Ultimate`).
- `GET /api/stripe/billing-status` re-syncs subscriptions from Stripe (defense against missed webhooks).
- Web soft gate + hard gate on `/api/treasuries` (Pro/Ultimate only).

## Webhooks

- Stripe: signature verification; fail closed on bad signature.
- Bridge: RSA public key from env; fail closed if unset.
- Idempotency tables for Stripe (and Bridge event recording) reduce duplicate side effects.

## Secrets & ops

- Secrets live in GitHub Actions / Cloud Run env — never commit `.env*` (except `.env.example`).
- Catalog: [ENVIRONMENT.md](ENVIRONMENT.md) · partner inventory: [API_KEYS.md](API_KEYS.md).
- Rotate keys via partner dashboards, then update Secrets/Variables and redeploy.

## Dependencies

- Production dependency licenses: [legal/THIRD_PARTY_NOTICES.md](legal/THIRD_PARTY_NOTICES.md).
- No known GPL/AGPL/SSPL in the production tree at last inventory.
