# API 介面

[English](API.md)

基底：正式主機（例如 `https://api.kura-finance.com`）。除註明外需 `/api/auth` session。

典型回應：`{ success, data }` 或 `{ success: false, error: { code, message, details? } }`。

## 掛載

| 路徑 | 認證 | 說明 |
|------|------|------|
| `GET /health` | 否 | 存活 |
| `/.well-known/apple-app-site-association` | 否 | iOS |
| `/.well-known/assetlinks.json` | 否 | Android |
| `/api/auth` | 混合 | 登入、登出、me、Passkey、推薦 |
| `/api/plaid` | 是 | 銀行連結 |
| `/api/assets` | 是 | 資產彙總／歷史 |
| `/api/exchange` | 是 | CEX（CCXT） |
| `/api/debank` | 是 | 鏈上部位 |
| `/api/stripe` | 混合 | Checkout／portal／billing-status；webhook |
| `/api/wallet` | 是 | 個人錢包／SCA |
| `/api/treasuries` | 是 + **Pro／Ultimate** | Treasury Safe（`requirePaidTier`） |
| `/api/bridge` | 混合 | 出入金；webhook |
| `/api/dinari` | 是 | 代幣化股票（Entity／KYC 白名單） |
| `/api/notifications` | 是 | 通知 |
| `/api/waitlist` | 部分 | 公開報名 |
| `/api/platform-insights` | 是 | 平台分析 |
| `/api/privy-analytics` | 是 | Privy 分析 |
| `/api/lifi-analytics` | 是 | LI.FI 量能 |

## 存取閘道

1. **`requireAuth`** — 多數 `/api/*`
2. **`webTierGate`** — Web：Basic 僅白名單；其餘需 Pro／Ultimate
3. **`requirePaidTier`** — `/api/treasuries` 對**所有** client：僅 Pro／Ultimate；Basic → `403 SUBSCRIPTION_REQUIRED`

## Webhook（raw body）

| 路徑 | 驗證 |
|------|------|
| `/api/stripe/webhook` | Stripe 簽章 |
| `/api/bridge/webhook` | Bridge RSA PEM |

## Treasuries 摘要

| 方法 | 路徑 | 用途 |
|------|------|------|
| GET | `/api/treasuries` | Workspace |
| POST | `/api/treasuries` | 建立（同 address idempotent） |
| PUT | `/api/treasuries` | 整包覆寫 |
| PUT | `/api/treasuries/active` | 設定 active |
| PATCH | `/api/treasuries/:id` | 重新命名 |
| DELETE | `/api/treasuries/:id` | 刪除 |

實作：`src/domains/treasury/`。
