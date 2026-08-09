# 安全概述

[English](SECURITY.md)

盡職調查用高層說明，非正式滲透測試報告。

## 身分與 session

- **Privy** 驗證終端身分；本 API 簽發自有 **JWT**（`JWT_SECRET`）。
- **WebAuthn／Passkey** 解鎖客戶端 E2EE；RP ID／origins 由環境變數設定。
- `/api/auth` 與一般 `/api/*` 有速率限制。

## 加密

- 依設計，敏感財務資料可客戶端 E2EE；伺服器可能只存密文與包裝金鑰。
- `ENCRYPTION_KEY`（64 hex）為關鍵密鑰。
- Passkey 包裝的 DEK 存在憑證列；無客戶端解鎖流程後端無法還原明文。

## 訂閱存取控制

- Stripe webhook 更新 `User.tier`（`Basic`｜`Pro`｜`Ultimate`）。
- `GET /api/stripe/billing-status` 會向 Stripe 重同步（補漏送 webhook）。
- Web soft gate；`/api/treasuries` 硬閘（僅 Pro／Ultimate）。

## Webhook

- Stripe：簽章驗證；失敗則拒絕。
- Bridge：環境變數 RSA 公鑰；未設則 fail-closed。
- 事件冪等記錄降低重複副作用。

## 密鑰與維運

- 密鑰在 GitHub Actions／Cloud Run — 切勿提交 `.env*`（僅追蹤 `.env.example`）。
- 目錄：[ENVIRONMENT.zh-TW.md](ENVIRONMENT.zh-TW.md) · 夥伴清單：[API_KEYS.zh-TW.md](API_KEYS.zh-TW.md)。
- 於夥伴後台輪替後，更新 Secrets／Variables 並重新部署。

## 相依套件

- [legal/THIRD_PARTY_NOTICES.zh-TW.md](legal/THIRD_PARTY_NOTICES.zh-TW.md)
- 最近盤點之正式環境樹未見 GPL／AGPL／SSPL。
