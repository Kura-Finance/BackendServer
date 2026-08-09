# API 介面

[English](API.md)

基底：你的 API 主機（例如 `https://api.example.com`）。除註明外需 `/api/auth` session。

典型回應：`{ success, data }` 或 `{ success: false, error: { code, message, details? } }`。

## 掛載

| 路徑 | 認證 | 說明 |
|------|------|------|
| `GET /health` | 否 | 存活（含 `features`） |
| `GET /api/features` | 否 | Domain 功能開關快照 |
| `/.well-known/apple-app-site-association` | 否 | iOS |
| `/.well-known/assetlinks.json` | 否 | Android |
| `/api/auth` | 混合 | 永遠開啟 |
| `/api/assets` | 是 | 永遠開啟 |
| `/api/plaid` … `/api/admin` | 依 domain | 由 [`src/config/features.ts`](../src/config/features.ts) 的 `FEATURES` 控制 |

關閉的 domain 不會掛路由（404）。

## 存取閘道

1. **`requireAuth`** — 多數 `/api/*`
2. **`webTierGate`** — Web：Basic 僅白名單（含 `/api/admin`、`/api/features`）；其餘需 Pro／Ultimate
3. **`requirePaidTier`** — `/api/treasuries` 對**所有** client：僅 Pro／Ultimate；Basic → `403 SUBSCRIPTION_REQUIRED`
4. **`requireAdmin`** — `/api/admin/*`：登入使用者 email 須在 `ADMIN_EMAILS`（或 `ADMIN_EMAIL`）；否則 `403 ADMIN_REQUIRED`
5. **`features.ts` 的 `FEATURES`** — 可選 domain 關閉時不掛載；Admin 內 Bridge／LI.FI 在對應 feature 關閉時回 `503`

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

## Platform insights（Investor）

`GET /api/platform-insights/summary` 的 `data.platformRevenue` 是 **唯一** 前端應顯示的 Platform revenue。前端不得自行推估手續費。

| 產品 | 費率 | 說明 |
|------|------|------|
| Bridge（Crypto <> Fiat） | process × 0.25% | 僅 Kura margin |
| Swap（LI.FI） | process × 0.25% | Integrator 會計 |
| Dinari（US Stocks） | 暫 0% | 仍追蹤 process volume |
| Earn | 收益 10% performance fee | 尚未追蹤 harvest 前認列營收為 `$0`；AUM 在 `earn` / `byProduct.earn.aumUsd` |
| Card | 預留 | `byProduct.card` 一律存在 |
| Subscriptions | 實收金額 | Stripe AR |

請優先使用 `platformRevenue.totalUsd` / `byProduct`；`process.totalNetUsd` 僅為相容鏡像。

## Admin — Dashboard

認證：session + admin email 白名單。供 Kura Admin console（`dashboard`）使用的讀取 API。

| 方法 | 路徑 | 用途 |
|------|------|------|
| GET | `/api/admin/users` | 全部使用者：tier、EOA/SCA、Bridge/Dinari KYC、累計 Bridge/Dinari 營收 |
| GET | `/api/admin/users/:id` | 單一使用者（不存在 → `404 NOT_FOUND`） |
| GET | `/api/admin/overview` | 平台指標（KYC funnel、Bridge/Dinari/Li.Fi、FeeWarp TVL、當月 `bridgeFraud`） |
| GET | `/api/admin/earn/fee-warps` | Base 上 Morpho FeeWrapper vault（即時 TVL） |
| GET | `/api/admin/lifi/summary` | 平台 Li.Fi `{ volumeUsd, feeUsd, transferCount }`（累計 `transfer_done`） |

備註：

- `walletBalanceUsd`／`totalWalletBalanceUsd` 以各用戶 `scaAddress` 即時查 DeBank（spot + DeFi；記憶體快取 5 分鐘）。無 SCA 為 `0`。需 `DEBANK_ACCESS_KEY`。
- FeeWarp `mau`／`feeWarpMauTotal` 目前固定為 `0`（尚無 deposit MAU indexer）；TVL 來自 Morpho 即時查詢。
- 營收合計來自 `PlatformRecord`（與 Investor platform-insights 同一帳本）。

## Admin — Bridge Funds Requests／Fraud Alerts

認證：session + admin email 白名單。Return 資金來源：Bridge Wallet（`BRIDGE_WALLET_ID`）。

Sync 時若出現**新的** `fraud=true`：會 `PUT` Bridge customer `status=paused`、寫入 `User.fraudSuspendedAt`，並寄 admin 信（`ADMIN_EMAIL`）。

| 方法 | 路徑 | 用途 |
|------|------|------|
| POST | `/api/admin/bridge/funds-requests/sync?force=` | Poll Bridge `GET /funds_requests`；新 fraud 自動 pause |
| GET | `/api/admin/bridge/funds-requests?fraud=&status=&limit=&offset=` | 本地 recall（`fraud=true` = Fraud Alerts） |
| POST | `/api/admin/bridge/funds-requests/:id/pause` | Pause Bridge customer + 平台停權 |
| POST | `/api/admin/bridge/funds-requests/:id/return` | 以 Bridge Wallet 建立 `fiat_deposit_return` |
| POST | `/api/admin/bridge/funds-requests/:id/remediate` | 一鍵：pause + return（return 失敗仍保留 pause） |
| GET | `/api/admin/bridge/fraud-rate?month=YYYY-MM` | 月詐欺率（US=存款月、EUR=recall 月；50 bps Penalty Box／7% critical） |
| POST | `/api/admin/bridge/customers/:bridgeCustomerId/unpause` | Sender 撤回 claim 後解除 Bridge pause |
| POST | `/api/admin/users/:id/clear-fraud-suspend` | 清除平台停權（不會自動 unpause Bridge） |
| GET | `/api/admin/bridge/inactive-customers?months=6&onlyWithActivatedVa=` | 超過 N 個月無互動的 Bridge 帳戶（預設 6；省 VA 成本） |
| POST | `/api/admin/bridge/inactive-customers/notify?months=6` | 同上掃描並寄 digest 到 `ADMIN_EMAIL` |
| POST | `/api/admin/bridge/customers/:userId/delete` | 手動清理：deactivate VA + `DELETE` Bridge customer + 移除本地 `BridgeCustomer` |

VA webhook `refunded` 會把對應 funds request 標成 `returned`。Fraud 停權使用者無法 `DELETE /api/auth/me` 或新建 Bridge KYC。