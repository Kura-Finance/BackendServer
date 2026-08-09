# 夥伴 API Key vs 免費公用端點

[English](API_KEYS.md)

本後端**沒有**使用 Alchemy / Infura / QuickNode（或任何自訂鏈上 RPC URL）。鏈上資產走 **DeBank**；Earn AUM 走 **Morpho 免費 GraphQL**。

## 功能開關

可選 domain：改 [`src/config/features.ts`](../src/config/features.ts) 的 `FEATURES`。關閉後不驗證該 domain 的 Key、也不掛路由。查詢：`GET /api/features`。

## 必須專有 Key（沒有可對等的免費公用替代）

| 服務 | 環境變數 | 原因 |
|------|----------|------|
| **App crypto** | `JWT_SECRET`、`ENCRYPTION_KEY` | Session／欄位加密 |
| **Postgres** | `DB_*` | 主資料庫 |
| **Resend** | `RESEND_API_KEY`、`RESEND_FROM_EMAIL` | 交易郵件 |
| **Plaid** | `PLAID_CLIENT_ID`、`PLAID_*_SECRET`、redirect／webhook | 銀行／投資彙總 |
| **Stripe** | `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、price IDs | 訂閱 |
| **Privy** | `PRIVY_APP_ID`、`PRIVY_APP_SECRET`、`PRIVY_VERIFICATION_KEY` | 登入／身分 |
| **Bridge** | `BRIDGE_API_KEY`、`BRIDGE_WEBHOOK_PUBLIC_KEY`（returns 另需 wallet） | 法幣出入金 |
| **Dinari** | `DINARI_API_KEY_ID`、`DINARI_API_SECRET_KEY` | 代幣化股票 |
| **DeBank** | `DEBANK_ACCESS_KEY` | 多鏈錢包／DeFi 部位 |

若要以「免費 public RPC」取代 DeBank，等於自己做多鏈索引（範圍大，功能也難對齊）。

## 可選 Key（沒有也能用／預設免費公用）

| 服務 | 環境變數 | 無 Key 時 |
|------|----------|-----------|
| **LI.FI analytics** | `LIFI_API_KEY`（可選）、`LIFI_INTEGRATOR`（sync 需要） | 公用 `https://li.quest`；Key 只提高額度 |
| **Logo.dev** | `LOGO_DEV_TOKEN` | **預設關閉** — 改用 Google favicon + jsDelivr crypto icons |
| **Bridge Wallet** | `BRIDGE_WALLET_ID` | 僅 fiat deposit return 需要 |

`LIFI_INTEGRATOR` 是 integrator **名稱**，不是秘密 API Key（篩選 analytics 仍需要）。

## 已是免費公用（無需 API Key）

| 服務 | 端點／做法 | 用途 |
|------|------------|------|
| **Morpho GraphQL** | `https://api.morpho.org/graphql` | Earn FeeWrapper AUM |
| **Yahoo Finance** | 非官方公用 | 股票 24h 漲跌 |
| **Binance public ticker**（CCXT） | 交易所公開 API | 加密貨幣 24h 漲跌 |
| **Google favicons** | `https://www.google.com/s2/favicons?domain=…` | 交易所／股票／機構 logo |
| **Crypto icons CDN** | jsDelivr `cryptocurrency-icons` | 幣種 icon |
| **Dicebear** | 公用 SVG | 預設頭像 |

## 使用者自帶 Key（非 env）

| 來源 | 儲存 | 說明 |
|------|------|------|
| CEX API keys | DB 加密（CCXT） | 使用者提供；查私有餘額需要 |

完整變數表見 [ENVIRONMENT.zh-TW.md](ENVIRONMENT.zh-TW.md)。
