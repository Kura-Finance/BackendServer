# Kura 後端 — 售出 Data Room

**產品：** Kura  
**法人：** Kura Finance LLC  
**標的：** BackendServer（本儲存庫）  
**密等：** 機密 — 僅供 NDA／SPA 流程下之潛在買家

[English](README.md)

本 Data Room 是倉庫內既有材料的**整理索引**。**不含**線上密鑰、客戶個資匯出或正式環境資料庫 dump。該等移轉依 SPA 與 [HANDOFF.zh-TW.md](../HANDOFF.zh-TW.md) 另行處理。

---

## 1. 使用方式

| 對象 | 從這裡開始 |
|------|------------|
| 法務／公司 | §2 公司與智財 |
| 技術盡職調查 | §3 產品與工程 |
| 維運／切換 | §4 基礎建設與交接 |
| 交易團隊 | §5 完備度檢查清單 |

可將本目錄（或整個 `docs/` + `LICENSE` + 原始碼）放入 VDR。原始碼封存請一併附上根目錄 `LICENSE`。

---

## 2. 公司與智財

| 項目 | 位置 | 說明 |
|------|------|------|
| 專有授權 | [../../LICENSE](../../LICENSE) | All Rights Reserved — Kura Finance LLC |
| 授權中文譯文 | [../legal/LICENSE.zh-TW.md](../legal/LICENSE.zh-TW.md) | 以英文為準 |
| 第三方開源聲明 | [../legal/THIRD_PARTY_NOTICES.zh-TW.md](../legal/THIRD_PARTY_NOTICES.zh-TW.md) | 寬鬆授權；未見 GPL／AGPL |
| 命名 | 產品 **Kura**；公司 **Kura Finance LLC** | |
| IP 歸屬證據 | 倉庫外（雇傭／承攬協議） | SPA 盡職調查必備 |
| 著作權年度 | 2024–2026 | 見 LICENSE |

**不在倉庫（由法務／賣方另附）：** 設立文件、股權結構、SPA 草案、員工 IP 讓與、商標、隱私權政策、服務條款。

---

## 3. 產品與工程

| 項目 | 位置 |
|------|------|
| 產品概述 | [../PRODUCT.zh-TW.md](../PRODUCT.zh-TW.md) |
| 架構 | [../ARCHITECTURE.zh-TW.md](../ARCHITECTURE.zh-TW.md) |
| API | [../API.zh-TW.md](../API.zh-TW.md) |
| 安全 | [../SECURITY.zh-TW.md](../SECURITY.zh-TW.md) |
| 環境變數 | [../ENVIRONMENT.zh-TW.md](../ENVIRONMENT.zh-TW.md) |
| 維運／部署 | [../OPERATIONS.zh-TW.md](../OPERATIONS.zh-TW.md) |
| 原始碼 | 倉庫根目錄（`src/`、`prisma/`） |
| Schema 歷史 | `prisma/migrations/` |
| 相依鎖定 | `package-lock.json` |

### 功能對照（後端）

認證 · Plaid · Assets · Exchange · DeBank · Wallet · **Treasury（Pro／Ultimate）** · Bridge · Dinari · Stripe · 通知 · Waitlist · 平台／Privy／LI.FI 分析

---

## 4. 基礎建設與交接

| 項目 | 位置 |
|------|------|
| 切換檢查清單 | [../HANDOFF.zh-TW.md](../HANDOFF.zh-TW.md) |
| Deploy workflow | [../../.github/workflows/deploy.yml](../../.github/workflows/deploy.yml) |
| Dockerfile | [../../Dockerfile](../../Dockerfile) |
| 密鑰**名稱**（非值） | HANDOFF + ENVIRONMENT |

**安全通道另傳：** GitHub Secrets 值、GCP SA、DB 密碼、夥伴 API key、正式 DB 快照。

---

## 5. 完備度檢查清單

### 本 Data Room 已涵蓋（經連結）

- [x] 專有 LICENSE
- [x] 第三方授權清冊
- [x] 產品／架構／API／安全／環境／維運（中英）
- [x] 售出交接清單
- [x] 原始碼、migrations、CI 部署路徑指標

### 賣方須另行提供

- [ ] SPA 及附件
- [ ] Kura Finance LLC 設立／存續證明
- [ ] 雇傭／承攬 IP 讓與
- [ ] 隱私權政策／條款／App Store 頁
- [ ] 夥伴合約移轉（Plaid、Stripe、Bridge、Dinari、Privy 等）
- [ ] 營運／營收數據附件（若有）
- [ ] 密鑰移轉與撤銷賣方存取計畫

### 明確排除（勿放入 VDR）

- `.env*` 或任何密鑰值
- 未經協議的正式 DB dump
- 客戶個資匯出
- 私鑰／PEM 私密材料

---

## 6. 建議 VDR 目錄

```
01_Corporate_IP/
02_Product_Technical/
03_Transfer/
04_Source_Pointer/
```

中英文件並陳（`*.zh-TW.md`）。

---

## 7. 完整文件索引

見 [../README.zh-TW.md](../README.zh-TW.md)。
