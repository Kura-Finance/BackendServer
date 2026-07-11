-- =====================================================
-- PR 5 — Drop legacy pre-E2EE columns, AssetPerformance table,
-- User.encryptedDataKey, and remaining stale rows.
--
-- 此 migration **具破壞性**：
--   1. 移除所有 Phase 2 server-side encryption 留下的欄位
--      （balance/amount/merchant/holdings/free/used/total/rawData/...）
--   2. 刪除 AssetPerformance 表（4 合 1 server-encrypted 快照不再使用）
--   3. 刪除 User.encryptedDataKey（KEK-wrapped DataKey；Phase 3 改用 keypair）
--   4. 刪除舊版 AssetSnapshot 4 合一欄位 + 對應 row（無 metric 的 row 在 zero-access
--      模式下無法解開，保留只會誤導前端）
--   5. AssetSnapshot.metric / payloadCiphertext / payloadKeyId 改為 NOT NULL
--      （Zero-access mode 下這三個欄位永遠成對寫入）
--
-- 執行前請確認：
--   - 已部署 PR 1～PR 4，且使用者已透過 /api/auth/keys/setup 設定 X25519 keypair
--   - 任何尚未 setup keypair 的使用者：legacy plaintext 將被永久丟棄；他們需要重新
--     觸發一次 sync（會 fail-fast 提示先 setup keypair）。
-- =====================================================

-- -----------------------------
-- 1) AssetPerformance：整張表刪除
-- -----------------------------
DROP TABLE IF EXISTS "AssetPerformance" CASCADE;


-- -----------------------------
-- 2) AssetSnapshot：清理舊欄位 + 舊 row
-- -----------------------------
-- 先刪掉「沒 metric / 沒 payloadCiphertext / 沒 payloadKeyId」的 row
-- （都是 PR 5 之前的 server-encrypted 4 合一 snapshot，前端解不開）
DELETE FROM "AssetSnapshot"
WHERE "metric" IS NULL
   OR "payloadCiphertext" IS NULL
   OR "payloadKeyId" IS NULL;

ALTER TABLE "AssetSnapshot"
  DROP COLUMN IF EXISTS "cashFlow",
  DROP COLUMN IF EXISTS "plaidInvestment",
  DROP COLUMN IF EXISTS "cryptoSpot",
  DROP COLUMN IF EXISTS "defiProtocol";

ALTER TABLE "AssetSnapshot"
  ALTER COLUMN "metric"            SET NOT NULL,
  ALTER COLUMN "payloadCiphertext" SET NOT NULL,
  ALTER COLUMN "payloadKeyId"      SET NOT NULL;


-- -----------------------------
-- 3) User.encryptedDataKey：欄位保留
--    Phase 2 DataKey 已被 X25519 keypair 取代，但 SRP signup 流程仍在使用此欄位；
--    後續 PR 改造 SRP 之後再 drop。本 migration 不動。
-- -----------------------------


-- -----------------------------
-- 4) ExchangeBalanceCache：drop free / used / total
-- -----------------------------
-- 刪掉沒加密 payload 的舊 row（legacy plaintext 直接拋棄）
DELETE FROM "ExchangeBalanceCache"
WHERE "payloadCiphertext" IS NULL OR "payloadKeyId" IS NULL;

ALTER TABLE "ExchangeBalanceCache"
  DROP COLUMN IF EXISTS "free",
  DROP COLUMN IF EXISTS "used",
  DROP COLUMN IF EXISTS "total";


-- -----------------------------
-- 5) ExchangeAssetCache：drop holdings / price / value / percentageOfTotal
-- -----------------------------
DELETE FROM "ExchangeAssetCache"
WHERE "payloadCiphertext" IS NULL OR "payloadKeyId" IS NULL;

ALTER TABLE "ExchangeAssetCache"
  DROP COLUMN IF EXISTS "holdings",
  DROP COLUMN IF EXISTS "price",
  DROP COLUMN IF EXISTS "value",
  DROP COLUMN IF EXISTS "percentageOfTotal";


-- -----------------------------
-- 6) PlaidAccountCache：drop name / balance / institutionName / logo / apy / mask
-- -----------------------------
DELETE FROM "PlaidAccountCache"
WHERE "payloadCiphertext" IS NULL OR "payloadKeyId" IS NULL;

ALTER TABLE "PlaidAccountCache"
  DROP COLUMN IF EXISTS "name",
  DROP COLUMN IF EXISTS "balance",
  DROP COLUMN IF EXISTS "institutionName",
  DROP COLUMN IF EXISTS "logo",
  DROP COLUMN IF EXISTS "apy",
  DROP COLUMN IF EXISTS "mask";


-- -----------------------------
-- 7) PlaidTransactionCache：drop merchant / amount / category / type / personalFinanceCategory /
--    recurringFrequency / enrichedMerchantName / merchantLogo / merchantCategory
-- -----------------------------
DELETE FROM "PlaidTransactionCache"
WHERE "payloadCiphertext" IS NULL OR "payloadKeyId" IS NULL;

ALTER TABLE "PlaidTransactionCache"
  DROP COLUMN IF EXISTS "merchant",
  DROP COLUMN IF EXISTS "amount",
  DROP COLUMN IF EXISTS "category",
  DROP COLUMN IF EXISTS "type",
  DROP COLUMN IF EXISTS "personalFinanceCategory",
  DROP COLUMN IF EXISTS "recurringFrequency",
  DROP COLUMN IF EXISTS "enrichedMerchantName",
  DROP COLUMN IF EXISTS "merchantLogo",
  DROP COLUMN IF EXISTS "merchantCategory";


-- -----------------------------
-- 8) PlaidInvestmentAccountCache：drop name / institutionName / logo
-- -----------------------------
DELETE FROM "PlaidInvestmentAccountCache"
WHERE "payloadCiphertext" IS NULL OR "payloadKeyId" IS NULL;

ALTER TABLE "PlaidInvestmentAccountCache"
  DROP COLUMN IF EXISTS "name",
  DROP COLUMN IF EXISTS "institutionName",
  DROP COLUMN IF EXISTS "logo";


-- -----------------------------
-- 9) PlaidInvestmentCache：drop symbol / name / holdings / currentPrice / logo
-- -----------------------------
DELETE FROM "PlaidInvestmentCache"
WHERE "payloadCiphertext" IS NULL OR "payloadKeyId" IS NULL;

ALTER TABLE "PlaidInvestmentCache"
  DROP COLUMN IF EXISTS "symbol",
  DROP COLUMN IF EXISTS "name",
  DROP COLUMN IF EXISTS "holdings",
  DROP COLUMN IF EXISTS "currentPrice",
  DROP COLUMN IF EXISTS "logo";


-- -----------------------------
-- 10) DeBankProtocolCache：drop name / rawData
-- -----------------------------
DELETE FROM "DeBankProtocolCache"
WHERE "payloadCiphertext" IS NULL OR "payloadKeyId" IS NULL;

ALTER TABLE "DeBankProtocolCache"
  DROP COLUMN IF EXISTS "name",
  DROP COLUMN IF EXISTS "rawData";


-- -----------------------------
-- 11) DeBankTokenCache：drop symbol / name / rawData
-- -----------------------------
DELETE FROM "DeBankTokenCache"
WHERE "payloadCiphertext" IS NULL OR "payloadKeyId" IS NULL;

ALTER TABLE "DeBankTokenCache"
  DROP COLUMN IF EXISTS "symbol",
  DROP COLUMN IF EXISTS "name",
  DROP COLUMN IF EXISTS "rawData";
