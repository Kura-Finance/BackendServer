# Kura 後端

**Kura** 多資產理財應用的開源後端 API。

技術棧：Node.js 24、TypeScript、Express 5、Prisma、PostgreSQL。可部署至 Google Cloud Run + Cloud SQL。

[English](README.md) · [貢獻指南](CONTRIBUTING.md)

## 授權

[MIT](LICENSE) · Copyright © 2024–2026 Kura Finance LLC

第三方聲明：[docs/legal/THIRD_PARTY_NOTICES.zh-TW.md](docs/legal/THIRD_PARTY_NOTICES.zh-TW.md)

## 文件

完整索引：**[docs/README.zh-TW.md](docs/README.zh-TW.md)**

| 文件 | 說明 |
|------|------|
| [docs/PRODUCT.zh-TW.md](docs/PRODUCT.zh-TW.md) | 產品概述 |
| [docs/ARCHITECTURE.zh-TW.md](docs/ARCHITECTURE.zh-TW.md) | 網域、認證、資料流 |
| [docs/API.zh-TW.md](docs/API.zh-TW.md) | HTTP 掛載與存取規則 |
| [docs/ENVIRONMENT.zh-TW.md](docs/ENVIRONMENT.zh-TW.md) | 環境變數 |
| [.env.example](.env.example) | 環境變數範本 |
| [src/config/features.ts](src/config/features.ts) | Domain 功能開關 |
| [docs/API_KEYS.zh-TW.md](docs/API_KEYS.zh-TW.md) | 夥伴 Key vs 免費公用端點 |
| [docs/OPERATIONS.zh-TW.md](docs/OPERATIONS.zh-TW.md) | 本地／Docker／Cloud Run |
| [docs/SECURITY.zh-TW.md](docs/SECURITY.zh-TW.md) | 安全模型 |

## 快速開始

前置：Node.js 24+、PostgreSQL。

```bash
cp .env.example .env.development
# 在 src/config/features.ts 只開啟你有 Key 的 domain
# 填入 JWT_SECRET、ENCRYPTION_KEY、DB_*，以及已開啟功能所需夥伴金鑰

npm ci
npx prisma migrate deploy   # 或：npx prisma migrate dev
npm run dev
```

健康檢查：`GET http://localhost:8080/health` · 功能開關：`GET http://localhost:8080/api/features`

## Scripts

| 指令 | 用途 |
|------|------|
| `npm run dev` | 開發伺服器（`ts-node-dev`） |
| `npm run build` | 編譯 TypeScript 至 `dist/` |
| `npm start` | 執行編譯後伺服器 |
| `npm run dbml` | 重新產生 Prisma client／DBML |
