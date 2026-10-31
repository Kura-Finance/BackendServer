# GCP 搬遷：備份並在「無組織（No organization）」專案重建

[English](README.md)

這組腳本會把目前託管在「組織所屬」Google Cloud 專案裡的 Kura 服務完整備份，
並在一個 **沒有組織上層（No organization）** 的全新專案中原樣重建。
GCP 專案一旦屬於某個組織，就 **無法** 被搬到「No organization」底下，
所以唯一的路徑是：備份 → 重新建立 → 切換。

GCP 上有哪些東西、怎麼搬：

| 資源 | 來源 | 搬遷方式 |
|------|------|----------|
| Cloud Run `kura-backend`（本 repo） | `.github/workflows/deploy.yml` | 複製映像 + 用匯出的環境變數重新部署 |
| Cloud Run `app`（WebClients） | `WebClients/.github/workflows/deploy.yml` | 同上 |
| Cloud SQL PostgreSQL（`kura_db`） | Prisma migrations | `gcloud sql export` → `gcloud sql import` |
| 容器映像（`gcr.io/<project>/…`） | CI 建置 | registry 對 registry 複製到名為 `gcr.io` 的 Artifact Registry repo |
| IAM、服務帳戶、網域對應 | — | 建立新的部署用服務帳戶與金鑰；網域對應可選擇重建 |

不在 GCP、不需要搬：LandingPage（Cloudflare Pages）、mobile-app（Expo / 商店）、
Privy、Stripe、Plaid、Bridge、Dinari、Resend。

## 事前準備

| 需要 | 原因 |
|------|------|
| `gcloud`（SDK ≥ 450）含 `beta` 元件 | 全部步驟 |
| `python3` | 改寫 JSON（只用標準函式庫） |
| `docker` **或** [`crane`](https://github.com/google/go-containerregistry) | 跨專案複製映像 |
| `gh`（選用） | `40-github-config.sh` |
| 來源專案的 Owner 權限 | 匯出 SQL、讀取 Cloud Run 環境變數 |
| **一般 Google 帳號（gmail.com）**，或組織允許建立無組織專案的帳號 | 只有這類帳號能建立沒有組織上層的專案 |
| 該帳號可用的計費帳戶 | Cloud SQL、Cloud Run 都要計費 |

如果同一個 `gcloud` 登入身分既有舊專案 Owner、又能建立無組織專案，全程用同一帳號即可。
否則：用組織帳號登入跑 `10-backup.sh`，再切換成個人帳號跑 `20-rebuild.sh`（備份資料夾就是交接點）。

> **Workspace 帳號注意**：`rick@theprism.ltd` 這類 Workspace / Cloud Identity 帳號建立的專案
> 預設會自動歸到該網域的組織底下。要得到真正的「No organization」，請用 gmail.com 帳號建立，
> 之後再把 Workspace 帳號加為 Owner。

## 執行

```bash
cd infra/gcp-migration
cp config.env.example config.env     # 填 SRC_PROJECT_ID、DST_PROJECT_ID、BILLING_ACCOUNT_ID、DB_PASSWORD …
./00-preflight.sh                     # 唯讀：檢查工具、登入、現有資源
./10-backup.sh                        # → backups/<timestamp>/（SQL dump 另存一份到 GCS）
./20-rebuild.sh                       # 新專案、API、registry、SQL、映像、Cloud Run、部署 SA
./30-verify.sh                        # /health、環境變數比對、SQL、計費
./40-github-config.sh                 # 更新兩個 repo 的 GitHub Variables / Secrets
```

`20-rebuild.sh` 可重複執行（已存在的資源會跳過）；失敗修正後直接重跑，或只跑部分步驟：

```bash
./20-rebuild.sh --only sql,run        # 步驟：project,apis,registry,sql,images,run,deploy-sa,domains
./20-rebuild.sh --yes                 # 略過確認
```

### `10-backup.sh` 會產生什麼

```
backups/<ts>/
  manifest.json              來源專案、時間、帳號
  project/                   project.json、已啟用 API、IAM policy、服務帳戶
  run/                       <service>.json/.yaml（完整規格含環境變數）、.iam.json、revisions、網域對應
  sql/                       instance / db / user 中繼資料、<instance>-<db>.sql.gz（serverless export 的 pg_dump）
  images/                    running-images.txt（service → image → digest）、選用的 <service>.tar
  secrets/ misc/             Secret Manager 內容、Scheduler、DNS zone、bucket 清單
```

> **這個資料夾含正式環境機密**（`JWT_SECRET`、`DB_PASSWORD`、合作夥伴金鑰、`dst/` 底下的 SA 金鑰）。
> 已列入 gitignore 並 `chmod 700`。要放到任何共用位置前請先加密，搬遷確認完成後請刪除。

### `20-rebuild.sh` 逐步說明

1. **project** – `gcloud projects create` 不帶 `--organization` / `--folder`，再連結計費。若建出來的專案仍有上層（帳號所屬組織強制），會警告並建議改用 gmail.com 帳號。
2. **apis** – Run、SQL Admin、Artifact Registry、Container Registry（`gcr.io` 轉址用）、Cloud Build、IAM、Secret Manager、Logging。
3. **registry** – 在 `us` 多區域建立名稱就叫 `gcr.io` 的 Artifact Registry Docker repo，讓 `gcr.io/<新專案>/…` 可用，**兩個 deploy workflow 只需改專案 ID 即可照常運作**。
4. **sql** – 依來源的引擎版本、機型、edition、可用性建立 instance（可用 `DST_SQL_TIER` 覆寫），建立 `DB_NAME`、設定 `DB_USER` 密碼、補建 dump 參照到的其他角色，把 dump 上傳到新專案 bucket 後以 `postgres` 身分匯入。`_prisma_migrations` 會一起搬過去，所以之後 CI 的 `prisma migrate deploy` 不會重跑。
5. **images** – 複製每個服務「目前正在跑」的那個映像（優先 `crane copy`，其次 `docker pull/push`，最後從備份的 tar `docker load`），並補打 `:latest`。
6. **run** – 每個服務用 `gcloud run deploy` 重建：環境變數走 `--env-vars-file`（逗號、換行安全），記憶體 / CPU / timeout / 併發 / 擴縮設定照搬，`DB_HOST` 與 Cloud SQL 掛載改寫成新的 connection name，`DB_PASSWORD` 換成 `config.env` 的值，來源若是公開（allUsers）也會一併還原。
7. **deploy-sa** – 建立 `github-deploy@<新專案>.iam.gserviceaccount.com`，授予 `run.admin`、`iam.serviceAccountUser`、`cloudsql.client`、`artifactregistry.writer`、`storage.objectAdmin`，金鑰寫到 `backups/<ts>/dst/`。
8. **domains** – 選用：`DOMAINS="api.example.com=kura-backend app.example.com=app"`，建立後印出要設定的 DNS 紀錄。網域必須先由執行腳本的帳號驗證（`gcloud domains verify`）。

## 切換檢查清單

- [ ] `30-verify.sh` 全綠；新後端 `GET /health` 的 `features` 與預期相同。
- [ ] 已跑 `40-github-config.sh`；push 到 `main` 會部署到新專案（看 Actions）。
- [ ] DNS：把 `api.` / `app.` 指到新的網域對應（或改用 Cloud Run 網址）。Cloudflare 請先關閉 proxy（DNS only）直到憑證簽發完成。
- [ ] Stripe、Plaid、Bridge 的 webhook URL 仍可連到（主機名不變則不用改）。
- [ ] WebAuthn RP ID / origins 與 Privy allowed origins 不變（主機名相同）。若改了主機名，`WEBAUTHN_*`、`ALLOWED_ORIGINS` 與 Web 的 build args 都要改。
- [ ] 舊專案：Cloud Run 設 `--max-instances=0` 或刪除服務，Cloud SQL 先停機保留一段時間，撤銷舊的部署金鑰，最後 `gcloud projects delete <舊專案>`。

## 不用腳本也能還原

備份資料夾就是純 `gcloud` 輸出，可以手動重放：

```bash
gcloud sql import sql NEW_INSTANCE gs://BUCKET/x.sql.gz --database kura_db --user postgres
gcloud run services replace backups/<ts>/run/kura-backend.yaml --region us-central1 --project NEW   # 先改 image / 專案參照
```

## 疑難排解

| 症狀 | 處理 |
|------|------|
| `projects create` 後專案仍有上層 | 帳號屬於 Workspace / Cloud Identity 組織。改用 gmail.com 帳號建立（之後可再把組織帳號加為 Owner）。 |
| `sql export` → bucket `PERMISSION_DENIED` | 腳本已授予 instance SA `objectAdmin`；IAM 需要約一分鐘生效，稍候重跑。 |
| `sql import` → `role "x" does not exist` | dump 參照到某個 DB 角色；腳本會依 `sql/<instance>.users.json` 補建。手動 `gcloud sql users create` 補上後，刪除 `dst/sql-imported.*` 再跑 `--only sql`。 |
| `run deploy` → 映像拉取失敗 | `registry` 步驟會授予 compute SA 讀取 `gcr.io`；用 `gcloud container images list --repository gcr.io/NEW` 確認映像存在。 |
| 服務起來但 DB 連線錯誤 | `DB_HOST` 必須是 `/cloudsql/NEW:REGION:INSTANCE`；檢查 `backups/<ts>/dst/<service>.env.yaml`。 |
| Workflow 推 `gcr.io/NEW/...` 失敗 | `gcr.io` Artifact Registry repo 不存在，或部署 SA 缺 `artifactregistry.writer`；重跑 `--only registry,deploy-sa`。 |
