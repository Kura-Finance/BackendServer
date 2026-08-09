# Kura 後端

**Kura** 多資產理財應用的後端 API，著作權人為 **Kura Finance LLC**。

技術棧：Node.js 24、TypeScript、Express 5、Prisma、PostgreSQL。正式環境部署至 Google Cloud Run，資料庫為 Cloud SQL。

[English](README.md)

## 授權

專有軟體（Proprietary）。Copyright © 2024–2026 Kura Finance LLC。詳見 [LICENSE](LICENSE)（英文為準）與 [docs/legal/LICENSE.zh-TW.md](docs/legal/LICENSE.zh-TW.md)（中文參考譯文）。

第三方開源依賴：[docs/legal/THIRD_PARTY_NOTICES.zh-TW.md](docs/legal/THIRD_PARTY_NOTICES.zh-TW.md)。

## 文件

完整索引：**[docs/README.zh-TW.md](docs/README.zh-TW.md)**

| 文件 | 說明 |
|------|------|
| [docs/data-room/README.zh-TW.md](docs/data-room/README.zh-TW.md) | **售出 Data Room**（買家盡職調查包） |
| [docs/PRODUCT.zh-TW.md](docs/PRODUCT.zh-TW.md) | 產品概述 |
| [docs/ARCHITECTURE.zh-TW.md](docs/ARCHITECTURE.zh-TW.md) | 網域、認證、資料流 |
| [docs/API.zh-TW.md](docs/API.zh-TW.md) | HTTP 掛載與存取規則 |
| [docs/ENVIRONMENT.zh-TW.md](docs/ENVIRONMENT.zh-TW.md) | 環境變數 |
| [.env.example](.env.example) | 本地／開源用環境變數範本 |
| [docs/OPERATIONS.zh-TW.md](docs/OPERATIONS.zh-TW.md) | 本地／Docker／Cloud Run |
| [docs/SECURITY.zh-TW.md](docs/SECURITY.zh-TW.md) | 安全模型 |
| [docs/HANDOFF.zh-TW.md](docs/HANDOFF.zh-TW.md) | 售出／交接清單 |

## 快速開始（本地）

前置：Node.js 24+、PostgreSQL。

```bash
cp .env.example .env.development   # 填入密鑰 — 見 docs/ENVIRONMENT.zh-TW.md
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

## 著作權

Copyright © 2024–2026 Kura Finance LLC. 保留所有權利。
