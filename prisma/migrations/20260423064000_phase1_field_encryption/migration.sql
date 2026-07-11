-- Phase 1: Zero-Knowledge Field Encryption Migration
-- 清空所有明文財務快取資料（用戶需重新同步）
-- 將數字欄位改為 TEXT 以存放 AES-256-GCM 加密字串

-- 1. 清空快取資料（放棄舊明文資料）
TRUNCATE TABLE "PlaidAccountCache" CASCADE;
TRUNCATE TABLE "PlaidTransactionCache" CASCADE;
TRUNCATE TABLE "PlaidInvestmentAccountCache" CASCADE;
TRUNCATE TABLE "PlaidInvestmentCache" CASCADE;
TRUNCATE TABLE "AssetSnapshot" CASCADE;
TRUNCATE TABLE "AssetPerformance" CASCADE;
TRUNCATE TABLE "PlaidSyncLog" CASCADE;

-- 2. PlaidAccountCache: balance Float → TEXT, apy Float? → TEXT?
ALTER TABLE "PlaidAccountCache"
  ALTER COLUMN "balance" TYPE TEXT USING "balance"::TEXT,
  ALTER COLUMN "apy" TYPE TEXT USING "apy"::TEXT;

-- 3. PlaidInvestmentCache: holdings Float → TEXT, currentPrice Float → TEXT
ALTER TABLE "PlaidInvestmentCache"
  ALTER COLUMN "holdings" TYPE TEXT USING "holdings"::TEXT,
  ALTER COLUMN "currentPrice" TYPE TEXT USING "currentPrice"::TEXT;

-- 4. AssetSnapshot: value Float → TEXT
ALTER TABLE "AssetSnapshot"
  ALTER COLUMN "value" TYPE TEXT USING "value"::TEXT;

-- 5. AssetPerformance: totalAssets Float → TEXT (drop default, re-add as TEXT)
ALTER TABLE "AssetPerformance"
  ALTER COLUMN "totalAssets" DROP DEFAULT,
  ALTER COLUMN "totalAssets" TYPE TEXT USING "totalAssets"::TEXT,
  ALTER COLUMN "totalAssets" SET DEFAULT '';
