# 環境變數

[English](ENVIRONMENT.md)

範本：**[../.env.example](../.env.example)** — 複製為 `.env.development` 供本地使用。

本地開發：當 `NODE_ENV` 非 `production` 且未設定 `DB_HOST` 時，會載入 `.env.development`（見 `src/config/env.ts`）。**切勿**提交真實 `.env*`（`.env.example` 會納入版控）。

驗證：啟動時執行 `validateEnvironment()`。夥伴 API Key 檢查僅在 [`src/config/features.ts`](../src/config/features.ts) 對應開關為開時執行。部分整合僅警告並繼續；正式環境缺必要變數時會結束行程。

## 功能開關（Domain toggles）

**唯一來源：** 改 [`src/config/features.ts`](../src/config/features.ts) 的 `FEATURES`（不用 env）。查詢：`GET /api/features`、`GET /health` → `features`。

永遠開啟：`auth`、`assets`。可選：`email`、`plaid`、`exchange`、`notifications`、`debank`、`stripe`、`wallet`、`treasury`、`bridge`、`dinari`、`waitlist`、`platformInsights`、`privyAnalytics`、`lifiAnalytics`、`admin`。

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

## 應用／CORS／admin

品牌字串（產品名、升級頁、demo 基底）在 [`src/config/brand.ts`](../src/config/brand.ts)，**不進 env**。前台 origin 由 `ALLOWED_ORIGINS` 推導。

| 變數 | 必填 | 說明 |
|------|------|------|
| `ALLOWED_ORIGINS` | 正式 | CORS（正式環境**唯一**來源）；第一個 HTTP origin = app URL |
| `ADMIN_EMAIL` | admin／fraud 郵件 | 空則拒絕 admin |
| `ADMIN_EMAILS` | 否 | 逗號分隔白名單；否則用 `ADMIN_EMAIL` |

GitHub 清單：[SECRETS.zh-TW.md](SECRETS.zh-TW.md)。

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
| `DEBANK_ACCESS_KEY` | 正式 | 專有；無對等免費公用替代 |
| `LOGO_DEV_TOKEN` | 否 | 可選。未設定時 logo 用免費 Google favicon + jsDelivr crypto icons |

專有 Key vs 免費公用清單見 [API_KEYS.zh-TW.md](API_KEYS.zh-TW.md)。

## Privy

| 變數 | 必填 | 說明 |
|------|------|------|
| `PRIVY_APP_ID` | 登入用 | |
| `PRIVY_APP_SECRET` | 登入用 | |
| `PRIVY_VERIFICATION_KEY` | 登入用 | 來自 Privy Dashboard |

## WebAuthn／Passkeys

| 變數 | 必填 | 說明 |
|------|------|------|
| `WEBAUTHN_RP_ID` | Passkey 用 | Web + mobile 共用 RP ID（你的 API 主機） |
| `WEBAUTHN_RP_NAME` | Passkey 用 | 顯示名稱 |
| `WEBAUTHN_ORIGIN` | Passkey 用 | 逗號分隔允許 origins；可含 `android:apk-key-hash:...` |
| `WEBAUTHN_RELATED_ORIGINS` | Web ROR 用 | `/.well-known/webauthn`（後備 `ALLOWED_ORIGINS`） |

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
| `LIFI_API_KEY` | 否 | 可選提高額度；公用 `li.quest` 無需 Key |
| `LIFI_INTEGRATOR` | 分析同步用 | Integrator **名稱**（非密鑰），逗號分隔 |

## 行動裝置關聯網域（well-known）

| 變數 | 必填 | 說明 |
|------|------|------|
| `APPLE_APP_ID` | iOS AASA | `TeamID.bundleId` — 未設則 404 |
| `ANDROID_PACKAGE_NAME` | assetlinks | 未設則 404 |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | assetlinks | 逗號分隔 SHA-256 指紋 |

## 除錯

| 變數 | 說明 |
|------|------|
| `DEBUG_COOKIES` | 設為 `true` 以記錄 cookie 除錯資訊 |

## GitHub Actions 對應

正式環境值由 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) 自 GitHub **Secrets**／**Variables** 注入。可選變數含 `ADMIN_EMAIL`、`SUPPORT_EMAIL`、`PLAID_SANDBOX_USER_IDS`、`DINARI_WHITELIST_*`，以及行動裝置 well-known 覆寫。
