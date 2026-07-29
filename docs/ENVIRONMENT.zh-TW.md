# 環境變數

[English](ENVIRONMENT.md)

本地開發：當 `NODE_ENV` 非 `production` 且未設定 `DB_HOST` 時，會載入 `.env.development`（見 `src/config/env.ts`）。**切勿**提交 `.env*` 檔案。

驗證：啟動時執行 `validateEnvironment()`。部分整合僅警告並繼續；正式環境缺必要變數時會結束行程。

## 核心（必填）

| 變數 | 必填 | 說明 |
|------|------|------|
| `JWT_SECRET` | 是 | App session 簽章 |
| `ENCRYPTION_KEY` | 是 | 64 個小寫 hex 字元（32 bytes AES-256） |
| `NODE_ENV` | 建議 | `development`／`production` |
| `PORT` | 否 | 預設 `8080` |

產生 `ENCRYPTION_KEY`：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 資料庫

| 變數 | 必填 | 說明 |
|------|------|------|
| `DB_USER` | 正式 | URL builder 預設 `postgres` |
| `DB_PASSWORD` | 正式 | |
| `DB_NAME` | 正式 | 預設 `kura_db` |
| `DB_HOST` | 正式 | TCP 主機，或 Cloud Run 的 `/cloudsql/INSTANCE` |
| `DB_PORT` | 否 | 預設 `5432` |
| `DB_SCHEMA` | 否 | 預設 `public` |
| `DATABASE_URL` | 自動 | 啟動時由 `buildDatabaseUrl()` 建立 |

## 應用／CORS／品牌

| 變數 | 必填 | 說明 |
|------|------|------|
| `ALLOWED_ORIGINS` | 正式 | 逗號分隔 origins |
| `APP_NAME` | 否 | 預設 `Kura` |
| `APP_URL` | 否 | 前端基底 URL |
| `APP_UPGRADE_URL` | 否 | 定價／升級連結 |
| `ADMIN_EMAIL` | 否 | 預設 `admin@kura-finance.com`（營運信箱 + admin 白名單後備） |
| `ADMIN_EMAILS` | 否 | 逗號分隔 admin 白名單（`/api/admin`）；未設則用 `ADMIN_EMAIL` |
| `SUPPORT_EMAIL` | 否 | 預設 `Support@kura-finance.com` |

## 郵件（Resend）

| 變數 | 必填 | 說明 |
|------|------|------|
| `RESEND_API_KEY` | 正式 | |
| `RESEND_FROM_EMAIL` | 正式 | 已驗證寄件者 |

## Plaid

| 變數 | 必填 | 說明 |
|------|------|------|
| `PLAID_CLIENT_ID` | 正式 | |
| `PLAID_SANDBOX_SECRET` | 正式 | |
| `PLAID_PRODUCTION_SECRET` | 正式 | |
| `PLAID_REDIRECT_URI` | 建議 | OAuth redirect |
| `PLAID_WEBHOOK_URL` | 建議 | |
| `PLAID_SANDBOX_USER_IDS` | 否 | 逗號分隔使用者 UUID，強制走 Sandbox |

## Stripe

| 變數 | 必填 | 說明 |
|------|------|------|
| `STRIPE_SECRET_KEY` | 正式 | |
| `STRIPE_WEBHOOK_SECRET` | 正式 | |
| `STRIPE_PRICE_PRO_MONTHLY` | 建議 | 對應 Pro（`getTierByPriceId`） |
| `STRIPE_PRICE_PRO_YEARLY` | 建議 | 對應 Pro |
| `STRIPE_PRICE_ULTIMATE_MONTHLY` | 建議 | 對應 Ultimate |
| `STRIPE_PRICE_ULTIMATE_YEARLY` | 建議 | 對應 Ultimate |
| `STRIPE_PRICE_PRO`／`STRIPE_PRICE_ULTIMATE` | 可選 | 舊別名（相同對應） |

## DeBank／Logo

| 變數 | 必填 | 說明 |
|------|------|------|
| `DEBANK_ACCESS_KEY` | 正式 | |
| `LOGO_DEV_TOKEN` | 否 | Logo.dev publishable key |

## Privy

| 變數 | 必填 | 說明 |
|------|------|------|
| `PRIVY_APP_ID` | 登入用 | |
| `PRIVY_APP_SECRET` | 登入用 | |
| `PRIVY_VERIFICATION_KEY` | 登入用 | 來自 Privy Dashboard |

## WebAuthn／Passkeys

| 變數 | 必填 | 說明 |
|------|------|------|
| `WEBAUTHN_RP_ID` | Passkey 用 | Web + mobile 共用：`api.kura-finance.com` |
| `WEBAUTHN_RP_NAME` | Passkey 用 | 例如 `Kura` |
| `WEBAUTHN_ORIGIN` | Passkey 用 | 逗號分隔；須含 `https://app.kura-finance.com`，可含 `android:apk-key-hash:...` |
| `WEBAUTHN_RELATED_ORIGINS` | Web ROR 用 | 允許使用 RP ID 的 origin 清單（`/.well-known/webauthn`；預設 `https://app.kura-finance.com`） |

## Bridge

| 變數 | 必填 | 說明 |
|------|------|------|
| `BRIDGE_API_KEY` | 正式 | |
| `BRIDGE_WEBHOOK_PUBLIC_KEY` | webhook 用 | PEM；密鑰庫可用 `\n` 表示換行 |
| `BRIDGE_FEE_CONFIG_ENABLED` | 否 | 功能開關 |
| `BRIDGE_WALLET_ID` | fiat return 用 | Bridge Wallet，作為 return 資金來源 |
| `BRIDGE_WALLET_CURRENCY` | 否 | 預設 `usdb` |
| `BRIDGE_FUNDS_REQUESTS_SYNC_MIN_INTERVAL_MS` | 否 | 預設 `300000`（5 分鐘）懶同步間隔 |

## Dinari

| 變數 | 必填 | 說明 |
|------|------|------|
| `DINARI_API_KEY_ID` | 正式 | |
| `DINARI_API_SECRET_KEY` | 正式 | |
| `DINARI_PAYMENT_TOKEN_ADDRESS` | 下單用 | 例如 USDC |
| `DINARI_ENVIRONMENT` | 否 | 例如 `sandbox` |
| `DINARI_CHAIN_ID` | 否 | 例如 `eip155:8453` |
| `DINARI_WHITELIST_EMAILS` | 否 | Email 及／或 `@domain` |
| `DINARI_WHITELIST_DOMAINS` | 否 | 逗號分隔網域（可不加 `@`） |

未設定白名單環境變數時，僅 demo email（`DEMO_USER_EMAILS`／demo 輔助）可存取 Dinari Entity／KYC。

## LI.FI

| 變數 | 必填 | 說明 |
|------|------|------|
| `LIFI_API_KEY` | 建議 | |
| `LIFI_INTEGRATOR` | 分析同步用 | 逗號分隔 integrator 名稱 |

## 行動裝置關聯網域（well-known）

| 變數 | 必填 | 說明 |
|------|------|------|
| `APPLE_APP_ID` | 否 | 預設 `K7FVP5GGP9.com.kurafinance.app` |
| `ANDROID_PACKAGE_NAME` | 否 | 預設 `com.kurafinance.app` |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | 否 | 逗號分隔；預設為現有 Kura 憑證指紋 |

## 除錯

| 變數 | 說明 |
|------|------|
| `DEBUG_COOKIES` | 設為 `true` 以記錄 cookie 除錯資訊 |

## GitHub Actions 對應

正式環境值由 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) 自 GitHub **Secrets**／**Variables** 注入。可選變數含 `ADMIN_EMAIL`、`SUPPORT_EMAIL`、`PLAID_SANDBOX_USER_IDS`、`DINARI_WHITELIST_*`，以及行動裝置 well-known 覆寫。
