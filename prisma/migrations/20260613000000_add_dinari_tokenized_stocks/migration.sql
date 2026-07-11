-- ============================================================
-- Dinari Tokenized Stocks (dShares)
-- User → DinariEntity → DinariAccount → DinariOrder
-- ============================================================

-- CreateTable
CREATE TABLE "DinariEntity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kycStatus" TEXT NOT NULL DEFAULT 'not_started',
    "rawKyc" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DinariEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DinariAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "walletAddress" TEXT,
    "walletChainId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DinariAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DinariOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "orderRequestId" TEXT NOT NULL,
    "orderId" TEXT,
    "stockId" TEXT,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tif" TEXT NOT NULL DEFAULT 'DAY',
    "status" TEXT NOT NULL DEFAULT 'QUOTED',
    "chainId" TEXT,
    "paymentToken" TEXT,
    "paymentTokenQuantity" TEXT,
    "assetTokenQuantity" TEXT,
    "limitPrice" TEXT,
    "clientOrderId" TEXT,
    "rawOrderRequest" JSONB,
    "rawOrder" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DinariOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DinariEntity_userId_key" ON "DinariEntity"("userId");
CREATE UNIQUE INDEX "DinariEntity_entityId_key" ON "DinariEntity"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DinariAccount_accountId_key" ON "DinariAccount"("accountId");
CREATE INDEX "DinariAccount_userId_idx" ON "DinariAccount"("userId");
CREATE INDEX "DinariAccount_accountId_idx" ON "DinariAccount"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "DinariOrder_orderRequestId_key" ON "DinariOrder"("orderRequestId");
CREATE INDEX "DinariOrder_userId_idx" ON "DinariOrder"("userId");
CREATE INDEX "DinariOrder_accountId_idx" ON "DinariOrder"("accountId");
CREATE INDEX "DinariOrder_orderId_idx" ON "DinariOrder"("orderId");

-- AddForeignKey
ALTER TABLE "DinariEntity" ADD CONSTRAINT "DinariEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DinariAccount" ADD CONSTRAINT "DinariAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DinariOrder" ADD CONSTRAINT "DinariOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DinariOrder" ADD CONSTRAINT "DinariOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "DinariAccount"("accountId") ON DELETE CASCADE ON UPDATE CASCADE;
