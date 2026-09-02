# 產品概述

[English](PRODUCT.md)

**Kura** 是多資產個人理財應用。本儲存庫為其 **後端 API**，著作權人為 **Prism Capital LLC**。

## 能力

| 領域 | 能力 |
|------|------|
| 認證 | Privy、App JWT、WebAuthn／Passkey、推薦／返現 |
| 銀行 | Plaid 連結、交易、投資帳戶 |
| 加密資產 | DeBank、CCXT 交易所、個人 SCA 錢包、**Treasury** Safe（Pro／Ultimate） |
| 市場 | 資產彙總、Yahoo Finance |
| 出入金 | Bridge KYC、轉帳、虛擬帳戶、webhook |
| 代幣化股票 | Dinari Entity／帳戶／訂單 |
| 計費 | Stripe 訂閱（Basic／Pro／Ultimate）；webhook 驅動等級 |
| 平台 | Waitlist、投資人洞察、Privy／LI.FI 分析 |

## 技術棧

- Node.js 24、TypeScript、Express 5
- Prisma + PostgreSQL（正式環境 Cloud SQL）
- 部署：GitHub Actions → Google Cloud Run

## 相關文件

- [ARCHITECTURE.zh-TW.md](ARCHITECTURE.zh-TW.md)
- [API.zh-TW.md](API.zh-TW.md)
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — 貢獻指南
