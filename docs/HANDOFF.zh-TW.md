# 售出／移轉交接檢查清單

[English](HANDOFF.md)

產品：**Kura**  
法人：**Kura Finance LLC**  
儲存庫：BackendServer（本程式碼庫）

於資產收購盡職調查與切換當日使用本清單。智慧財產權讓與應載於買賣協議（SPA）；本儲存庫依 [LICENSE](../LICENSE) 提供專有原始碼。

## 1. 智慧財產權

- [ ] 確認 SPA 將本儲存庫著作權讓與買方（或依協商授予專屬授權）。
- [ ] 確認作者（`rick-kura-dev`／`chaindevrick` 等）之雇傭／承攬 IP 歸屬文件齊備。
- [ ] 審閱 [legal/THIRD_PARTY_NOTICES.zh-TW.md](legal/THIRD_PARTY_NOTICES.zh-TW.md)；相依授權多為寬鬆條款（未發現已知 copyleft 阻礙）。
- [ ] 備註：與 history rewrite 相關之本地 backup 分支僅供盡職調查，勿視為釋出產物。
- [ ] 以 [data-room/README.zh-TW.md](data-room/README.zh-TW.md) 作為買家索引（不含密鑰）。

## 2. 原始碼與 CI

- [ ] 移轉或 fork GitHub org／repo（`Kura-Finance/BackendServer` 或繼任者）。
- [ ] 移轉 GitHub Actions secrets／variables（見下方清單），或於買方 org 重建。
- [ ] 若買方使用新 GCP 專案，更新 deploy workflow 中的專案／instance 名稱。
- [ ] 確認正式環境已設定 `BRIDGE_WEBHOOK_PUBLIC_KEY`（硬編碼後備已移除）。

## 3. Google Cloud

現有正式環境識別（依協議重新品牌或移轉）：

| 項目 | 現值 |
|------|------|
| Cloud Run 服務 | `kura-backend` |
| 區域 | `us-central1` |
| Cloud SQL instance | `kura-492622:us-central1:kura-postgres` |
| DB 使用者／名稱 | `kura_user`／`kura_db` |

- [ ] 移轉 GCP 專案所有權，**或**新建專案並遷移資料庫。
- [ ] 移轉後輪替 `GCP_SA_KEY`；撤銷賣方存取。
- [ ] 匯出／遷移 Cloud SQL；在目標環境驗證 `prisma migrate deploy`。
- [ ] 更新 `api.kura-finance.com`（或買方網域）DNS → Cloud Run。

## 4. 夥伴帳號（憑證 + webhook）

移轉所有權或建立買方帳號，並切換環境變數：

| 夥伴 | Secrets／設定 | 備註 |
|------|---------------|------|
| Privy | `PRIVY_*` | App 所有權 + 允許 origins |
| Plaid | `PLAID_*` | Redirect URI、webhook URL、sandbox／production |
| Stripe | `STRIPE_*` + price IDs | Webhook 指向 API |
| Bridge | `BRIDGE_API_KEY`、`BRIDGE_WEBHOOK_PUBLIC_KEY` | 重新註冊 webhook；複製新 PEM |
| Dinari | `DINARI_*` | 白名單網域／email 以 env 設定 |
| DeBank | `DEBANK_ACCESS_KEY` | |
| Resend | `RESEND_*` | 驗證寄件網域 |
| LI.FI | `LIFI_API_KEY`、`LIFI_INTEGRATOR` | Integrator 名稱可維持 `kura` 或變更 |
| Logo.dev | `LOGO_DEV_TOKEN` | |

- [ ] 所有夥伴 webhook 指向切換後 API 主機名。
- [ ] 買方金鑰上線後撤銷賣方 API keys。

## 5. 網域、郵件、行動裝置

- [ ] 網域：`kura-finance.com`、`api.`、`app.`、`demo.`（依適用）。
- [ ] 信箱：設定 `ADMIN_EMAIL`／`SUPPORT_EMAIL`（或維持預設）。
- [ ] Apple：Team ID + bundle → `APPLE_APP_ID`；API 主機 Associated Domains。
- [ ] Android：`ANDROID_PACKAGE_NAME` + `ANDROID_SHA256_CERT_FINGERPRINTS`；Digital Asset Links。
- [ ] WebAuthn：`WEBAUTHN_RP_ID`／`WEBAUTHN_ORIGIN` 須與線上 API 及 app hash 一致。

## 6. 資料與合規

- [ ] 協議 DB 快照範圍（使用者、連結帳戶、KYC 狀態、計費）。
- [ ] 確認 SPA 下個資／財務資料處理義務。
- [ ] 輪替 `JWT_SECRET`／`ENCRYPTION_KEY` 須有 session 失效／重新加密計畫（與行動／Web 客戶端協調）。

## 7. 切換後煙霧測試

- [ ] 正式環境 `GET /health`。
- [ ] Privy 登入 → JWT session。
- [ ] iOS／Android Passkey 註冊／驗證。
- [ ] Plaid 連結（必要時以 `PLAID_SANDBOX_USER_IDS`）。
- [ ] Stripe checkout／webhook。
- [ ] Bridge webhook 簽章接受事件。
- [ ] Dinari 白名單仍允許預期操作者。

## 8. GitHub Secrets／Variables 清單

**Secrets（典型）：**  
`GCP_PROJECT_ID`、`GCP_SA_KEY`、`DB_PASSWORD`、`JWT_SECRET`、`ENCRYPTION_KEY`、`PLAID_CLIENT_ID`、`PLAID_PRODUCTION_SECRET`、`PLAID_REDIRECT_URI`、`PLAID_WEBHOOK_URL`、`LOGO_DEV_PUBLISHABLE_KEY`、`ALLOWED_ORIGINS`、`RESEND_API_KEY`、`RESEND_FROM_EMAIL`、`APP_NAME`、`APP_URL`、`DEBANK_ACCESS_KEY`、`STRIPE_*`、`BRIDGE_API_KEY`、`BRIDGE_WEBHOOK_PUBLIC_KEY`、`DINARI_API_KEY_ID`、`DINARI_API_SECRET_KEY`、`PRIVY_*`、`LIFI_API_KEY`。

**Variables（可選）：**  
`BRIDGE_FEE_CONFIG_ENABLED`、`ADMIN_EMAIL`、`SUPPORT_EMAIL`、`PLAID_SANDBOX_USER_IDS`、`DINARI_WHITELIST_DOMAINS`、`DINARI_WHITELIST_EMAILS`、`APPLE_APP_ID`、`ANDROID_PACKAGE_NAME`、`ANDROID_SHA256_CERT_FINGERPRINTS`。

若 Dinari 白名單先前依賴已移除的內建網域 `theprism.ltd`，部署前請設定 `DINARI_WHITELIST_DOMAINS=theprism.ltd`（或買方對應網域）。
