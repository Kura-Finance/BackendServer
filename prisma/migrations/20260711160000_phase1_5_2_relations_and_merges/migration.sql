-- Phase 1.5 + 2: FK integrity + structural table merges

-- ============================================================
-- 1. ExchangeBalanceCache + ExchangeAssetCache → ExchangeCache
-- ============================================================

CREATE TABLE "ExchangeCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchangeAccountId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "payloadCiphertext" TEXT,
    "payloadKeyId" TEXT,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeCache_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ExchangeCache" (
    "id", "userId", "exchangeAccountId", "exchange", "kind", "symbol",
    "payloadCiphertext", "payloadKeyId", "cachedAt", "updatedAt"
)
SELECT
    "id", "userId", "exchangeAccountId", "exchange", 'balance', "symbol",
    "payloadCiphertext", "payloadKeyId", "cachedAt", "updatedAt"
FROM "ExchangeBalanceCache";

INSERT INTO "ExchangeCache" (
    "id", "userId", "exchangeAccountId", "exchange", "kind", "symbol",
    "payloadCiphertext", "payloadKeyId", "cachedAt", "updatedAt"
)
SELECT
    "id", "userId", "exchangeAccountId", "exchange", 'asset', "symbol",
    "payloadCiphertext", "payloadKeyId", "cachedAt", "updatedAt"
FROM "ExchangeAssetCache";

DELETE FROM "ExchangeCache" ec
WHERE NOT EXISTS (
    SELECT 1 FROM "ExchangeAccount" ea WHERE ea."id" = ec."exchangeAccountId"
);

CREATE UNIQUE INDEX "ExchangeCache_userId_exchangeAccountId_kind_symbol_key"
    ON "ExchangeCache"("userId", "exchangeAccountId", "kind", "symbol");

CREATE INDEX "ExchangeCache_userId_idx" ON "ExchangeCache"("userId");
CREATE INDEX "ExchangeCache_userId_exchangeAccountId_idx" ON "ExchangeCache"("userId", "exchangeAccountId");
CREATE INDEX "ExchangeCache_userId_exchangeAccountId_kind_idx" ON "ExchangeCache"("userId", "exchangeAccountId", "kind");
CREATE INDEX "ExchangeCache_payloadKeyId_idx" ON "ExchangeCache"("payloadKeyId");

ALTER TABLE "ExchangeCache"
    ADD CONSTRAINT "ExchangeCache_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExchangeCache"
    ADD CONSTRAINT "ExchangeCache_exchangeAccountId_fkey"
    FOREIGN KEY ("exchangeAccountId") REFERENCES "ExchangeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExchangeCache"
    ADD CONSTRAINT "ExchangeCache_payloadKeyId_fkey"
    FOREIGN KEY ("payloadKeyId") REFERENCES "EncryptedPayloadKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "ExchangeBalanceCache";
DROP TABLE "ExchangeAssetCache";

-- ============================================================
-- 2. DeBankProtocolCache + DeBankTokenCache → DeBankCache
-- ============================================================

CREATE TABLE "DeBankCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payloadCiphertext" TEXT,
    "payloadKeyId" TEXT,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeBankCache_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DeBankCache" (
    "id", "userId", "kind", "address", "chain", "entityId",
    "payloadCiphertext", "payloadKeyId", "cachedAt", "updatedAt"
)
SELECT
    "id", "userId", 'protocol', "address", "chain", "protocolId",
    "payloadCiphertext", "payloadKeyId", "cachedAt", "updatedAt"
FROM "DeBankProtocolCache";

INSERT INTO "DeBankCache" (
    "id", "userId", "kind", "address", "chain", "entityId",
    "payloadCiphertext", "payloadKeyId", "cachedAt", "updatedAt"
)
SELECT
    "id", "userId", 'token', "address", "chain", "tokenId",
    "payloadCiphertext", "payloadKeyId", "cachedAt", "updatedAt"
FROM "DeBankTokenCache";

CREATE UNIQUE INDEX "DeBankCache_userId_kind_address_chain_entityId_key"
    ON "DeBankCache"("userId", "kind", "address", "chain", "entityId");

CREATE INDEX "DeBankCache_userId_idx" ON "DeBankCache"("userId");
CREATE INDEX "DeBankCache_userId_address_idx" ON "DeBankCache"("userId", "address");
CREATE INDEX "DeBankCache_cachedAt_idx" ON "DeBankCache"("cachedAt");
CREATE INDEX "DeBankCache_payloadKeyId_idx" ON "DeBankCache"("payloadKeyId");

ALTER TABLE "DeBankCache"
    ADD CONSTRAINT "DeBankCache_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeBankCache"
    ADD CONSTRAINT "DeBankCache_payloadKeyId_fkey"
    FOREIGN KEY ("payloadKeyId") REFERENCES "EncryptedPayloadKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "DeBankProtocolCache";
DROP TABLE "DeBankTokenCache";

-- ============================================================
-- 3. BridgeLiquidationAddress + BridgePayoutLiquidationAddress merge
-- ============================================================

ALTER TABLE "BridgeLiquidationAddress"
    ADD COLUMN "direction" TEXT,
    ADD COLUMN "bridgeExternalAccountId" TEXT,
    ADD COLUMN "returnAddress" TEXT;

UPDATE "BridgeLiquidationAddress" SET "direction" = 'in';

ALTER TABLE "BridgeLiquidationAddress"
    ALTER COLUMN "direction" SET NOT NULL,
    ALTER COLUMN "destinationAddress" DROP NOT NULL;

INSERT INTO "BridgeLiquidationAddress" (
    "id", "userId", "bridgeCustomerId", "bridgeLiquidationAddressId", "direction", "state",
    "sourceChain", "sourceCurrency", "destinationRail", "destinationCurrency",
    "destinationAddress", "bridgeExternalAccountId", "returnAddress",
    "depositAddress", "blockchainMemo", "developerFeePercent", "createdAt", "updatedAt"
)
SELECT
    "id", "userId", "bridgeCustomerId", "bridgeLiquidationAddressId", 'out', "state",
    "sourceChain", "sourceCurrency", "destinationRail", "destinationCurrency",
    NULL, "bridgeExternalAccountId", "returnAddress",
    "depositAddress", "blockchainMemo", "developerFeePercent", "createdAt", "updatedAt"
FROM "BridgePayoutLiquidationAddress";

DROP INDEX IF EXISTS "BridgeLiquidationAddress_userId_sourceChain_sourceCurrency_d_key";

CREATE UNIQUE INDEX "BridgeLiquidationAddress_userId_direction_sourceChain_sourceCu_key"
    ON "BridgeLiquidationAddress"(
        "userId",
        "direction",
        "sourceChain",
        "sourceCurrency",
        "destinationRail",
        "destinationCurrency",
        "bridgeExternalAccountId"
    );

CREATE INDEX "BridgeLiquidationAddress_userId_direction_idx"
    ON "BridgeLiquidationAddress"("userId", "direction");

DROP TABLE "BridgePayoutLiquidationAddress";

-- ============================================================
-- 4. Bridge child tables → BridgeCustomer FK
-- ============================================================

UPDATE "BridgeExternalAccount" bea
SET "bridgeCustomerId" = NULL
WHERE "bridgeCustomerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "BridgeCustomer" bc
    WHERE bc."bridgeCustomerId" = bea."bridgeCustomerId"
  );

UPDATE "BridgeTransfer" bt
SET "bridgeCustomerId" = NULL
WHERE "bridgeCustomerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "BridgeCustomer" bc
    WHERE bc."bridgeCustomerId" = bt."bridgeCustomerId"
  );

UPDATE "BridgeVirtualAccount" bva
SET "bridgeCustomerId" = NULL
WHERE "bridgeCustomerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "BridgeCustomer" bc
    WHERE bc."bridgeCustomerId" = bva."bridgeCustomerId"
  );

UPDATE "BridgeLiquidationAddress" bla
SET "bridgeCustomerId" = NULL
WHERE "bridgeCustomerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "BridgeCustomer" bc
    WHERE bc."bridgeCustomerId" = bla."bridgeCustomerId"
  );

UPDATE "BridgeLiquidationAddress" bla
SET "bridgeExternalAccountId" = NULL
WHERE "bridgeExternalAccountId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "BridgeExternalAccount" bea
    WHERE bea."bridgeExternalAccountId" = bla."bridgeExternalAccountId"
  );

ALTER TABLE "BridgeExternalAccount"
    ADD CONSTRAINT "BridgeExternalAccount_bridgeCustomerId_fkey"
    FOREIGN KEY ("bridgeCustomerId") REFERENCES "BridgeCustomer"("bridgeCustomerId")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BridgeTransfer"
    ADD CONSTRAINT "BridgeTransfer_bridgeCustomerId_fkey"
    FOREIGN KEY ("bridgeCustomerId") REFERENCES "BridgeCustomer"("bridgeCustomerId")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BridgeVirtualAccount"
    ADD CONSTRAINT "BridgeVirtualAccount_bridgeCustomerId_fkey"
    FOREIGN KEY ("bridgeCustomerId") REFERENCES "BridgeCustomer"("bridgeCustomerId")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BridgeVirtualAccount_bridgeCustomerId_idx"
    ON "BridgeVirtualAccount"("bridgeCustomerId");

ALTER TABLE "BridgeLiquidationAddress"
    ADD CONSTRAINT "BridgeLiquidationAddress_bridgeCustomerId_fkey"
    FOREIGN KEY ("bridgeCustomerId") REFERENCES "BridgeCustomer"("bridgeCustomerId")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BridgeLiquidationAddress"
    ADD CONSTRAINT "BridgeLiquidationAddress_bridgeExternalAccountId_fkey"
    FOREIGN KEY ("bridgeExternalAccountId") REFERENCES "BridgeExternalAccount"("bridgeExternalAccountId")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BridgeLiquidationAddress_bridgeCustomerId_idx"
    ON "BridgeLiquidationAddress"("bridgeCustomerId");

-- ============================================================
-- 5. DinariAccount.entityId → DinariEntity.entityId
-- ============================================================

DELETE FROM "DinariAccount" da
WHERE NOT EXISTS (
    SELECT 1 FROM "DinariEntity" de WHERE de."entityId" = da."entityId"
);

ALTER TABLE "DinariAccount"
    ADD CONSTRAINT "DinariAccount_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "DinariEntity"("entityId")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DinariAccount_entityId_idx" ON "DinariAccount"("entityId");
