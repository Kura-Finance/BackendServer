-- =====================================================
-- Phase 3 Zero-Access E2EE — Foundation (additive only)
--
-- 本 migration 為純加法：
--   - User 新增 publicKey / encryptedPrivateKey / keyPairAlgorithm / keyPairCreatedAt
--   - 新增 EncryptedPayloadKey 表
--   - 8 張業務 cache 表 + AssetSnapshot 各加 nullable payloadCiphertext / payloadKeyId 欄位 + FK
--
-- 不刪除任何欄位 / 不 truncate 任何資料。
-- 移除舊欄位放在 PR 5 cleanup migration。
-- =====================================================

-- -----------------------------
-- 1) User: 新增 E2EE keypair 欄位
-- -----------------------------
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "publicKey"            TEXT,
ADD COLUMN IF NOT EXISTS "encryptedPrivateKey"  TEXT,
ADD COLUMN IF NOT EXISTS "keyPairAlgorithm"     TEXT NOT NULL DEFAULT 'x25519-xchacha20',
ADD COLUMN IF NOT EXISTS "keyPairCreatedAt"     TIMESTAMP(3);


-- -----------------------------
-- 2) EncryptedPayloadKey 表
-- -----------------------------
CREATE TABLE IF NOT EXISTS "EncryptedPayloadKey" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "scope"       TEXT NOT NULL,
    "wrappedSek"  TEXT NOT NULL,
    "algorithm"   TEXT NOT NULL DEFAULT 'x25519-sealedbox+aes-256-gcm',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncryptedPayloadKey_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EncryptedPayloadKey_userId_scope_createdAt_idx"
    ON "EncryptedPayloadKey"("userId", "scope", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EncryptedPayloadKey_userId_fkey'
  ) THEN
    ALTER TABLE "EncryptedPayloadKey"
      ADD CONSTRAINT "EncryptedPayloadKey_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


-- -----------------------------
-- 3) 業務 cache 表加 payloadCiphertext / payloadKeyId
--    所有 column 都 nullable，FK 為 SET NULL（避免 cascade 牽連）
-- -----------------------------

-- PlaidTransactionCache
ALTER TABLE "PlaidTransactionCache"
ADD COLUMN IF NOT EXISTS "plaidItemId"       TEXT,
ADD COLUMN IF NOT EXISTS "payloadCiphertext" TEXT,
ADD COLUMN IF NOT EXISTS "payloadKeyId"      TEXT;

-- 把 amount / merchant / category / type / personalFinanceCategory / 
-- recurringFrequency / enrichedMerchantName / merchantLogo / merchantCategory 
-- 改為 nullable（為 PR 5 之前的並存期準備；PR 2 寫入端只填新欄位）
ALTER TABLE "PlaidTransactionCache"
ALTER COLUMN "merchant"                DROP NOT NULL,
ALTER COLUMN "amount"                  DROP NOT NULL,
ALTER COLUMN "category"                DROP NOT NULL,
ALTER COLUMN "type"                    DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "PlaidTransactionCache_userId_plaidItemId_idx"
    ON "PlaidTransactionCache"("userId", "plaidItemId");
CREATE INDEX IF NOT EXISTS "PlaidTransactionCache_payloadKeyId_idx"
    ON "PlaidTransactionCache"("payloadKeyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaidTransactionCache_payloadKeyId_fkey'
  ) THEN
    ALTER TABLE "PlaidTransactionCache"
      ADD CONSTRAINT "PlaidTransactionCache_payloadKeyId_fkey"
      FOREIGN KEY ("payloadKeyId") REFERENCES "EncryptedPayloadKey"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 移除舊有的 PFC index（PFC 即將加密，無法直接索引）
DROP INDEX IF EXISTS "PlaidTransactionCache_userId_personalFinanceCategory_idx";


-- PlaidAccountCache
ALTER TABLE "PlaidAccountCache"
ADD COLUMN IF NOT EXISTS "payloadCiphertext" TEXT,
ADD COLUMN IF NOT EXISTS "payloadKeyId"      TEXT;

ALTER TABLE "PlaidAccountCache"
ALTER COLUMN "name"             DROP NOT NULL,
ALTER COLUMN "balance"          DROP NOT NULL,
ALTER COLUMN "institutionName"  DROP NOT NULL,
ALTER COLUMN "logo"             DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "PlaidAccountCache_payloadKeyId_idx"
    ON "PlaidAccountCache"("payloadKeyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaidAccountCache_payloadKeyId_fkey'
  ) THEN
    ALTER TABLE "PlaidAccountCache"
      ADD CONSTRAINT "PlaidAccountCache_payloadKeyId_fkey"
      FOREIGN KEY ("payloadKeyId") REFERENCES "EncryptedPayloadKey"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- PlaidInvestmentAccountCache
ALTER TABLE "PlaidInvestmentAccountCache"
ADD COLUMN IF NOT EXISTS "payloadCiphertext" TEXT,
ADD COLUMN IF NOT EXISTS "payloadKeyId"      TEXT;

ALTER TABLE "PlaidInvestmentAccountCache"
ALTER COLUMN "name"             DROP NOT NULL,
ALTER COLUMN "institutionName"  DROP NOT NULL,
ALTER COLUMN "logo"             DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "PlaidInvestmentAccountCache_payloadKeyId_idx"
    ON "PlaidInvestmentAccountCache"("payloadKeyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaidInvestmentAccountCache_payloadKeyId_fkey'
  ) THEN
    ALTER TABLE "PlaidInvestmentAccountCache"
      ADD CONSTRAINT "PlaidInvestmentAccountCache_payloadKeyId_fkey"
      FOREIGN KEY ("payloadKeyId") REFERENCES "EncryptedPayloadKey"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- PlaidInvestmentCache
ALTER TABLE "PlaidInvestmentCache"
ADD COLUMN IF NOT EXISTS "payloadCiphertext" TEXT,
ADD COLUMN IF NOT EXISTS "payloadKeyId"      TEXT;

ALTER TABLE "PlaidInvestmentCache"
ALTER COLUMN "symbol"        DROP NOT NULL,
ALTER COLUMN "name"          DROP NOT NULL,
ALTER COLUMN "holdings"      DROP NOT NULL,
ALTER COLUMN "currentPrice"  DROP NOT NULL,
ALTER COLUMN "logo"          DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "PlaidInvestmentCache_payloadKeyId_idx"
    ON "PlaidInvestmentCache"("payloadKeyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaidInvestmentCache_payloadKeyId_fkey'
  ) THEN
    ALTER TABLE "PlaidInvestmentCache"
      ADD CONSTRAINT "PlaidInvestmentCache_payloadKeyId_fkey"
      FOREIGN KEY ("payloadKeyId") REFERENCES "EncryptedPayloadKey"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- ExchangeBalanceCache
ALTER TABLE "ExchangeBalanceCache"
ADD COLUMN IF NOT EXISTS "payloadCiphertext" TEXT,
ADD COLUMN IF NOT EXISTS "payloadKeyId"      TEXT;

ALTER TABLE "ExchangeBalanceCache"
ALTER COLUMN "free"   DROP NOT NULL,
ALTER COLUMN "used"   DROP NOT NULL,
ALTER COLUMN "total"  DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "ExchangeBalanceCache_payloadKeyId_idx"
    ON "ExchangeBalanceCache"("payloadKeyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ExchangeBalanceCache_payloadKeyId_fkey'
  ) THEN
    ALTER TABLE "ExchangeBalanceCache"
      ADD CONSTRAINT "ExchangeBalanceCache_payloadKeyId_fkey"
      FOREIGN KEY ("payloadKeyId") REFERENCES "EncryptedPayloadKey"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- ExchangeAssetCache
ALTER TABLE "ExchangeAssetCache"
ADD COLUMN IF NOT EXISTS "payloadCiphertext" TEXT,
ADD COLUMN IF NOT EXISTS "payloadKeyId"      TEXT;

ALTER TABLE "ExchangeAssetCache"
ALTER COLUMN "holdings"           DROP NOT NULL,
ALTER COLUMN "price"              DROP NOT NULL,
ALTER COLUMN "value"              DROP NOT NULL,
ALTER COLUMN "percentageOfTotal"  DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "ExchangeAssetCache_payloadKeyId_idx"
    ON "ExchangeAssetCache"("payloadKeyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ExchangeAssetCache_payloadKeyId_fkey'
  ) THEN
    ALTER TABLE "ExchangeAssetCache"
      ADD CONSTRAINT "ExchangeAssetCache_payloadKeyId_fkey"
      FOREIGN KEY ("payloadKeyId") REFERENCES "EncryptedPayloadKey"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- DeBankProtocolCache
ALTER TABLE "DeBankProtocolCache"
ADD COLUMN IF NOT EXISTS "payloadCiphertext" TEXT,
ADD COLUMN IF NOT EXISTS "payloadKeyId"      TEXT;

ALTER TABLE "DeBankProtocolCache"
ALTER COLUMN "name"     DROP NOT NULL,
ALTER COLUMN "rawData"  DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "DeBankProtocolCache_payloadKeyId_idx"
    ON "DeBankProtocolCache"("payloadKeyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeBankProtocolCache_payloadKeyId_fkey'
  ) THEN
    ALTER TABLE "DeBankProtocolCache"
      ADD CONSTRAINT "DeBankProtocolCache_payloadKeyId_fkey"
      FOREIGN KEY ("payloadKeyId") REFERENCES "EncryptedPayloadKey"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- DeBankTokenCache
ALTER TABLE "DeBankTokenCache"
ADD COLUMN IF NOT EXISTS "payloadCiphertext" TEXT,
ADD COLUMN IF NOT EXISTS "payloadKeyId"      TEXT;

ALTER TABLE "DeBankTokenCache"
ALTER COLUMN "symbol"   DROP NOT NULL,
ALTER COLUMN "name"     DROP NOT NULL,
ALTER COLUMN "rawData"  DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "DeBankTokenCache_payloadKeyId_idx"
    ON "DeBankTokenCache"("payloadKeyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeBankTokenCache_payloadKeyId_fkey'
  ) THEN
    ALTER TABLE "DeBankTokenCache"
      ADD CONSTRAINT "DeBankTokenCache_payloadKeyId_fkey"
      FOREIGN KEY ("payloadKeyId") REFERENCES "EncryptedPayloadKey"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- AssetSnapshot：per-metric 欄位 + payload
ALTER TABLE "AssetSnapshot"
ADD COLUMN IF NOT EXISTS "metric"            TEXT,
ADD COLUMN IF NOT EXISTS "payloadCiphertext" TEXT,
ADD COLUMN IF NOT EXISTS "payloadKeyId"      TEXT;

ALTER TABLE "AssetSnapshot"
ALTER COLUMN "cashFlow"         DROP NOT NULL,
ALTER COLUMN "plaidInvestment"  DROP NOT NULL,
ALTER COLUMN "cryptoSpot"       DROP NOT NULL,
ALTER COLUMN "defiProtocol"     DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "AssetSnapshot_userId_metric_recordedAt_idx"
    ON "AssetSnapshot"("userId", "metric", "recordedAt");
CREATE INDEX IF NOT EXISTS "AssetSnapshot_payloadKeyId_idx"
    ON "AssetSnapshot"("payloadKeyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AssetSnapshot_payloadKeyId_fkey'
  ) THEN
    ALTER TABLE "AssetSnapshot"
      ADD CONSTRAINT "AssetSnapshot_payloadKeyId_fkey"
      FOREIGN KEY ("payloadKeyId") REFERENCES "EncryptedPayloadKey"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
