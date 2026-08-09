# 維運

[English](OPERATIONS.md)

## 本地開發

1. 安裝 Node.js 24+。
2. 建立 PostgreSQL 資料庫（例如 `kura_db`）。
3. 複製環境變數範本並填入密鑰：

```bash
cp .env.example .env.development
```

   至少設定 `JWT_SECRET`、`ENCRYPTION_KEY`、資料庫變數，以及所需夥伴金鑰（見 [ENVIRONMENT.zh-TW.md](ENVIRONMENT.zh-TW.md)）。
4. 安裝與遷移：

```bash
npm ci
npx prisma migrate deploy
npm run dev
```

5. 驗證：`curl -s http://localhost:8080/health`

Prisma client 會由 `predev` script 自動產生。

## Docker

多階段建置：Node 24 Alpine，編譯 TypeScript，以 `dumb-init` 執行 `node dist/index.js`。

```bash
docker build -t kura-backend .
docker run --env-file .env.production -p 8080:8080 kura-backend
```

正式環境變數於執行時提供；映像檔不內嵌密鑰。

## 正式部署（權威路徑）

**唯一真相來源：** [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

推送至 `main` 或 `develop` 時：

1. 以 `GCP_SA_KEY` 驗證 GCP。
2. 透過 Cloud SQL Auth Proxy，對 instance `kura-492622:us-central1:kura-postgres` 執行 `prisma migrate deploy`。
3. 建置並推送映像至 `gcr.io/$PROJECT_ID/kura-backend`。
4. 部署至 `us-central1` 的 Cloud Run 服務 `kura-backend`，並掛載 Cloud SQL。

### 舊檔（勿當主要路徑）

| 檔案 | 狀態 |
|------|------|
| `cloudbuild.yaml` | 過時；引用不存在的 `k8s/` |
| `app.yaml` | App Engine 殘留；環境變數名稱可能過期 |

正式變更請一律使用 GitHub Actions → Cloud Run。

## Migrations

- 開發環境以 `npx prisma migrate dev --name <name>` 撰寫。
- 正式環境以 `npx prisma migrate deploy` 套用（CI 在部署前執行）。
- 已套用之 migration 不可修改；請新增新的 migration。
- Schema：`prisma/schema.prisma`。可選 DBML 輸出在 `prisma/dbml/`（已 gitignore）。

## 日誌

Winston 日誌位於 `src/domains/logger/`。Daily rotate 可能寫入 `logs/`（已 gitignore）。Cloud Run 請依 stdout／stderr → Cloud Logging。

## 健康檢查與規模

- 存活：`GET /health`
- Workflow 預設：512Mi RAM、1 CPU、逾時 3600s、未驗證 ingress（受保護路由仍需應用層認證）。
- 同步負載變大時，可於 deploy workflow flags 調整記憶體／CPU。

## 密鑰輪替

於夥伴後台輪替後，更新 GitHub Secrets 並重新部署。移轉完成後撤銷賣方持有金鑰（見 [HANDOFF.zh-TW.md](HANDOFF.zh-TW.md)）。

Bridge webhook PEM：將完整 PEM 存入 `BRIDGE_WEBHOOK_PUBLIC_KEY`。若密鑰庫壓平成單行，使用字面 `\n`；伺服器讀取時會正規化。
