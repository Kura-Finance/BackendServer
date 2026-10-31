# 密鑰與設定（僅功能性）

[English](SECRETS.md)

對應 [`src/config/features.ts`](../src/config/features.ts) 與 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)。

## 各類值放哪裡

| 類型 | 存放處 | 例子 |
|------|--------|------|
| 部署身分 | GitHub **Secret** | `GCP_SA_KEY`（GitHub 唯一需要的 Secret） |
| 部署到哪 | GitHub **Variables** | `GCP_PROJECT_ID`、`GCP_REGION`、`CLOUD_RUN_SERVICE`、`CLOUD_SQL_INSTANCE`、`DB_USER`、`DB_NAME`、`DB_SCHEMA` |
| 憑證／金鑰 | **Google Secret Manager**（與 Cloud Run 同專案） | 下表全部 |
| 執行期設定 | **Cloud Run 服務的環境變數** | `ALLOWED_ORIGINS`、`WEBAUTHN_*`、`ADMIN_EMAIL`、`RESEND_FROM_EMAIL`、`PLAID_*_URI/URL`、`STRIPE_PRICE_*`、`DINARI_ENVIRONMENT`、`DINARI_CHAIN_ID`、`LIFI_INTEGRATOR`、mobile well-known 變數 |
| 品牌字串 | 程式碼 | `src/config/brand.ts` |

部署 workflow 只做三件事：建映像、跑 migration、換映像。`gcloud run deploy --image` 會保留服務上既有的環境變數與 secret 綁定，所以執行期設定改在服務上，不在 GitHub：

```bash
gcloud run services update kura-backend --region us-central1 --project PROJECT \
  --update-env-vars ALLOWED_ORIGINS=https://app.example.com,WEBAUTHN_RP_ID=api.example.com
```

（含逗號的值請用 `--env-vars-file` 或 `^;^` 分隔語法。）

## Secret Manager 密鑰（密鑰名 = 環境變數名）

由 workflow 的 `secrets:` 區塊綁定。第一次可用 `infra/gcp-migration/50-secret-manager.sh`（從執行中的服務讀值）建立，或手動：

```bash
printf '%s' 'VALUE' | gcloud secrets create JWT_SECRET --data-file=- --replication-policy=automatic
```

| 一定要 | 依功能（`FEATURES.*`） |
|--------|------------------------|
| `DB_PASSWORD` | `email`：`RESEND_API_KEY` |
| `JWT_SECRET` | `plaid`：`PLAID_CLIENT_ID`、`PLAID_SANDBOX_SECRET`、`PLAID_PRODUCTION_SECRET` |
| `ENCRYPTION_KEY` | `debank`：`DEBANK_ACCESS_KEY` |
| `PRIVY_APP_ID`、`PRIVY_APP_SECRET` | `stripe`：`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` |
| 選用 `PRIVY_VERIFICATION_KEY`（PEM；未設則自動抓 JWKS） | `bridge`：`BRIDGE_API_KEY`、`BRIDGE_WEBHOOK_PUBLIC_KEY`（PEM，多行安全） |
| 選用 `LOGO_DEV_TOKEN` | `dinari`：`DINARI_API_KEY_ID`、`DINARI_API_SECRET_KEY` |
| | `lifiAnalytics`：選用 `LIFI_API_KEY` |

Cloud Run 執行用服務帳戶與部署用服務帳戶都需要 `roles/secretmanager.secretAccessor`。

在 `features.ts` 關掉某個 domain 後，把它的行從 workflow 的 `secrets:` 移除即可（密鑰本身可留著）。

## 可從 GitHub 刪除（已不再讀取）

除 `GCP_SA_KEY` 以外的所有 Secrets，以及「部署到哪」那組以外的所有 Variables。包括：`DB_PASSWORD`、`JWT_SECRET`、`ENCRYPTION_KEY`、`PRIVY_*`、夥伴金鑰、`ALLOWED_ORIGINS`、`WEBAUTHN_*`、`STRIPE_PRICE_*`、`APP_*`、`DATABASE_URL`、`DIDIT_*`、`GNOSIS_PAY_*`、`LITHIC_*`、`CODEGO_*`、`MAILERSEND_*`。

## 可從 Cloud Run 服務刪除（程式沒有讀）

`ADMIN_SECRET_KEY`、`APP_NAME`、`APP_URL`、`BACKEND_USE_HTTPS`、`PLAID_SECRET`、`WEB3AUTH_AUDIENCE`、`JWT_RS256_*`、`CODEGO_*`、`DIDIT_*`、`GNOSIS_PAY_*`、`LITHIC_*`、`MAILERSEND_*`，以及任何不是合法識別字的鍵（被切壞的 PEM 或 CSV 片段）。`50-secret-manager.sh` 會一併移除。
