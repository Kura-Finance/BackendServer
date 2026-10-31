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

正式環境的主機名、Cloud SQL instance、WebAuthn origins 等**不可**寫死在 workflow（公開後人人可見）。請設為 GitHub Variables。

本倉庫 workflow 注入**核心 + Privy + WebAuthn**，以及 [`src/config/features.ts`](../src/config/features.ts) 目前開啟之 domain 夥伴金鑰。Fork 請依自己的 flags 刪減 `env_vars`。`vars.X || secrets.X` 在值從 Secret 搬到 Variable 前仍可用。

## 搬到另一個 GCP 專案（例如「No organization」）

GCP 專案無法從組織底下搬出。要搬遷整套服務，請用
[`infra/gcp-migration/`](../infra/gcp-migration/README.zh-TW.md) 的腳本備份後重建：
SQL 匯出／匯入、映像複製到相容 `gcr.io` 的 Artifact Registry repo、以匯出的環境變數重新部署 Cloud Run、
建立新的部署服務帳戶，以及一個改寫 GitHub Variables／Secrets 的輔助腳本。
deploy workflow 本身不用改，只需更新 `GCP_PROJECT_ID`、`CLOUD_SQL_INSTANCE`、`GCP_SA_KEY`。

## Migrations／日誌／擴展

見英文版 [OPERATIONS.md](OPERATIONS.md)。
