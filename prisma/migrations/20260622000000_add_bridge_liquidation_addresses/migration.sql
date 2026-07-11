-- Bridge Liquidation Address（永久 crypto 入金：Tron USDT → Base USDC）

CREATE TABLE "BridgeLiquidationAddress" (
    "id"                         TEXT NOT NULL,
    "userId"                     TEXT NOT NULL,
    "bridgeCustomerId"           TEXT,
    "bridgeLiquidationAddressId" TEXT NOT NULL,
    "state"                      TEXT NOT NULL DEFAULT 'active',
    "sourceChain"                TEXT NOT NULL,
    "sourceCurrency"             TEXT NOT NULL,
    "destinationRail"            TEXT NOT NULL,
    "destinationCurrency"        TEXT NOT NULL,
    "destinationAddress"         TEXT NOT NULL,
    "depositAddress"             TEXT NOT NULL,
    "blockchainMemo"             TEXT,
    "developerFeePercent"        TEXT,
    "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeLiquidationAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BridgeLiquidationAddress_bridgeLiquidationAddressId_key"
    ON "BridgeLiquidationAddress"("bridgeLiquidationAddressId");

CREATE UNIQUE INDEX "BridgeLiquidationAddress_userId_sourceChain_sourceCurrency_d_key"
    ON "BridgeLiquidationAddress"("userId", "sourceChain", "sourceCurrency", "destinationRail", "destinationCurrency");

CREATE INDEX "BridgeLiquidationAddress_userId_idx"
    ON "BridgeLiquidationAddress"("userId");

CREATE INDEX "BridgeLiquidationAddress_bridgeLiquidationAddressId_idx"
    ON "BridgeLiquidationAddress"("bridgeLiquidationAddressId");

ALTER TABLE "BridgeLiquidationAddress"
    ADD CONSTRAINT "BridgeLiquidationAddress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
