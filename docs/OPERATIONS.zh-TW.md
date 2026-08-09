# 維運

[English](OPERATIONS.md)

## 本地開發

1. 安裝 Node.js 24+。
2. 建立 PostgreSQL 資料庫（例如 `kura_db`）。
3. 複製環境變數範本並填入密鑰：

```bash
cp .env.example .env.development
```

   至少設定 `JWT_SECRET`、`ENCRYPTION_KEY`、資料庫變數，以及 [`src/config/features.ts`](../src/config/features.ts) 已開啟 domain 所需夥伴金鑰（見 [ENVIRONMENT.zh-TW.md](ENVIRONMENT.zh-TW.md)）。
4. 安裝與遷移：

```bash
npm ci
npx prisma migrate deploy
npm run dev
```

5. 驗證：`curl -s http://localhost:8080/health`

Prisma client 會由 `predev` script 自動產生。

## Docker

```bash
docker build -t kura-backend .
docker run --env-file .env.production -p 8080:8080 kura-backend
```

正式環境變數於執行時注入；映像不內嵌密鑰。

## 正式部署

**來源：** [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

Secrets vs Variables（保留／可刪／應改 Variables）：**[SECRETS.zh-TW.md](SECRETS.zh-TW.md)**。完整目錄：[ENVIRONMENT.zh-TW.md](ENVIRONMENT.zh-TW.md)。

Deploy 預設只注入**核心 + Privy + WebAuthn**。開啟 [`src/config/features.ts`](../src/config/features.ts) 對應 domain 時，再把夥伴金鑰加回 workflow。

## Migrations／日誌／擴展

見英文版 [OPERATIONS.md](OPERATIONS.md)。
