# Kura 後端

**Kura** 多資產理財應用的後端 API，著作權人為 **Kura Finance LLC**。

技術棧：Node.js 24、TypeScript、Express 5、Prisma、PostgreSQL。正式環境部署至 Google Cloud Run，資料庫為 Cloud SQL。

[English](README.md)

## 授權

專有軟體（Proprietary）。Copyright © 2024–2026 Kura Finance LLC。詳見 [LICENSE](LICENSE)（英文為準）與 [LICENSE.zh-TW.md](LICENSE.zh-TW.md)（中文參考譯文）。

第三方開源依賴見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)／[THIRD_PARTY_NOTICES.zh-TW.md](THIRD_PARTY_NOTICES.zh-TW.md)。

## 文件

| 文件 | 說明 |
|------|------|
| [docs/ARCHITECTURE.zh-TW.md](docs/ARCHITECTURE.zh-TW.md) | 網域架構、認證、資料流 |
| [docs/ENVIRONMENT.zh-TW.md](docs/ENVIRONMENT.zh-TW.md) | 環境變數目錄 |
| [docs/OPERATIONS.zh-TW.md](docs/OPERATIONS.zh-TW.md) | 本地執行、Docker、Cloud Run、migration |
| [docs/HANDOFF.zh-TW.md](docs/HANDOFF.zh-TW.md) | 售出／交接檢查清單 |

英文版：`docs/*.md`（無 `.zh-TW` 後綴）。

## 快速開始（本地）

前置：Node.js 24+、PostgreSQL，以及 `.env.development`（見 [ENVIRONMENT.zh-TW.md](docs/ENVIRONMENT.zh-TW.md)）。

```bash
npm ci
npx prisma migrate deploy   # 或：npx prisma migrate dev
npm run dev
```

健康檢查：`GET http://localhost:8080/health`

## Scripts

| 指令 | 用途 |
|------|------|
| `npm run dev` | 開發伺服器（熱重載） |
| `npm run build` | 編譯 TypeScript 至 `dist/` |
| `npm start` | 執行編譯後伺服器 |
| `npm run dbml` | 重新產生 Prisma client / DBML |

## API 概覽

| 掛載路徑 | 網域 |
|----------|------|
| `/api/auth` | 認證、Privy、Passkey、推薦 |
| `/api/plaid` | 銀行連結（Plaid） |
| `/api/assets` | 資產彙總 |
| `/api/exchange` | 中心化交易所（CCXT） |
| `/api/debank` | 鏈上錢包（DeBank） |
| `/api/stripe` | 訂閱計費 |
| `/api/wallet` | 錢包／E2EE 相關 |
| `/api/bridge` | 出入金（Bridge） |
| `/api/dinari` | 代幣化股票（Dinari） |
| `/api/notifications` | 通知 |
| `/api/waitlist` | 候補名單 |
| `/api/platform-insights` | 平台分析 |
| `/api/privy-analytics` | Privy 分析 |
| `/api/lifi-analytics` | LI.FI 分析 |
| `/.well-known/*` | Apple／Android 關聯網域 |
| `/health` | 存活檢查 |

## 著作權

Copyright © 2024–2026 Kura Finance LLC. 保留所有權利。
