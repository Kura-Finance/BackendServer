# Secrets／Variables（只留功能用）

[English](SECRETS.md)

對齊 [`src/config/features.ts`](../src/config/features.ts) 與 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)。

**原則**
- **Secrets** = 能授權存取的憑證
- **Variables** = 非密設定（URL、公鑰、ID）
- **不進 env：** 品牌名／升級頁／demo 文案 — 見 `src/config/brand.ts`（程式常數；前台 URL 由 `ALLOWED_ORIGINS` 推導）

## 必留 Secrets（核心）

`GCP_SA_KEY`、`DB_PASSWORD`、`JWT_SECRET`、`ENCRYPTION_KEY`、`PRIVY_APP_ID`、`PRIVY_APP_SECRET`、`PRIVY_VERIFICATION_KEY`

## 必留 Variables（核心）

`GCP_PROJECT_ID`、`GCP_REGION`、`CLOUD_RUN_SERVICE`、`CLOUD_SQL_INSTANCE`、`DB_*`、`ALLOWED_ORIGINS`、`ADMIN_EMAIL`、`WEBAUTHN_*`、行動裝置 well-known（可選）

## Domain Secrets — 僅 `FEATURES.* === true`

| Feature | Secrets |
|---------|---------|
| `email` | `RESEND_API_KEY` |
| `plaid` | `PLAID_CLIENT_ID`、`PLAID_PRODUCTION_SECRET` |
| `stripe` | `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` |
| `debank` | `DEBANK_ACCESS_KEY` |
| `bridge` | `BRIDGE_API_KEY` |
| `dinari` | `DINARI_API_KEY_ID`、`DINARI_API_SECRET_KEY` |
| `lifiAnalytics` | `LIFI_API_KEY`（可選） |

## 可從 GitHub 刪除

`APP_NAME`、`APP_URL`、`APP_UPGRADE_URL`、`DEMO_BASE_URL`、`SUPPORT_EMAIL`、`LOGO_DEV_*`，以及 `FEATURES` 關閉之夥伴金鑰。

完整表見 [SECRETS.md](SECRETS.md)。
