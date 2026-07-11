-- Bridge Payout Liquidation Address（Base USDC → 法幣銀行，永久出金地址）

CREATE TABLE "BridgePayoutLiquidationAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bridgeCustomerId" TEXT,
    "bridgeLiquidationAddressId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'active',
    "sourceChain" TEXT NOT NULL,
    "sourceCurrency" TEXT NOT NULL,
    "destinationRail" TEXT NOT NULL,
    "destinationCurrency" TEXT NOT NULL,
    "bridgeExternalAccountId" TEXT NOT NULL,
    "depositAddress" TEXT NOT NULL,
    "blockchainMemo" TEXT,
    "returnAddress" TEXT,
    "developerFeePercent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgePayoutLiquidationAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BridgePayoutLiquidationAddress_bridgeLiquidationAddressId_key"
    ON "BridgePayoutLiquidationAddress"("bridgeLiquidationAddressId");

CREATE UNIQUE INDEX "BridgePayoutLiquidationAddress_userId_sourceChain_sourceCurren_key"
    ON "BridgePayoutLiquidationAddress"(
        "userId",
        "sourceChain",
        "sourceCurrency",
        "destinationRail",
        "destinationCurrency",
        "bridgeExternalAccountId"
    );

CREATE INDEX "BridgePayoutLiquidationAddress_userId_idx"
    ON "BridgePayoutLiquidationAddress"("userId");

CREATE INDEX "BridgePayoutLiquidationAddress_bridgeLiquidationAddressId_idx"
    ON "BridgePayoutLiquidationAddress"("bridgeLiquidationAddressId");

CREATE INDEX "BridgePayoutLiquidationAddress_bridgeExternalAccountId_idx"
    ON "BridgePayoutLiquidationAddress"("bridgeExternalAccountId");

ALTER TABLE "BridgePayoutLiquidationAddress"
    ADD CONSTRAINT "BridgePayoutLiquidationAddress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
