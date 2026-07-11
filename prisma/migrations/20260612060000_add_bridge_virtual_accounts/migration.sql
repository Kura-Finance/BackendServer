-- ============================================================
-- Bridge Virtual Accounts (per-customer persistent fiat deposit accounts)
-- 入金（on-ramp）改用 Virtual Account
-- ============================================================

-- CreateTable
CREATE TABLE "BridgeVirtualAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bridgeCustomerId" TEXT,
    "bridgeVirtualAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'activated',
    "sourceCurrency" TEXT NOT NULL,
    "destinationRail" TEXT NOT NULL,
    "destinationCurrency" TEXT NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "developerFeePercent" TEXT,
    "depositInstructions" JSONB,
    "rawAccount" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeVirtualAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeVirtualAccountEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bridgeVirtualAccountId" TEXT NOT NULL,
    "bridgeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" TEXT,
    "currency" TEXT,
    "subtotalAmount" TEXT,
    "developerFeeAmount" TEXT,
    "exchangeFeeAmount" TEXT,
    "gasFee" TEXT,
    "depositId" TEXT,
    "destinationTxHash" TEXT,
    "rawEvent" JSONB,
    "occurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BridgeVirtualAccountEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BridgeVirtualAccount_bridgeVirtualAccountId_key" ON "BridgeVirtualAccount"("bridgeVirtualAccountId");
CREATE INDEX "BridgeVirtualAccount_userId_idx" ON "BridgeVirtualAccount"("userId");
CREATE INDEX "BridgeVirtualAccount_bridgeVirtualAccountId_idx" ON "BridgeVirtualAccount"("bridgeVirtualAccountId");
CREATE UNIQUE INDEX "BridgeVirtualAccount_userId_sourceCurrency_destinationRail_d_key" ON "BridgeVirtualAccount"("userId", "sourceCurrency", "destinationRail", "destinationCurrency");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeVirtualAccountEvent_bridgeEventId_key" ON "BridgeVirtualAccountEvent"("bridgeEventId");
CREATE INDEX "BridgeVirtualAccountEvent_userId_idx" ON "BridgeVirtualAccountEvent"("userId");
CREATE INDEX "BridgeVirtualAccountEvent_bridgeVirtualAccountId_idx" ON "BridgeVirtualAccountEvent"("bridgeVirtualAccountId");
CREATE INDEX "BridgeVirtualAccountEvent_depositId_idx" ON "BridgeVirtualAccountEvent"("depositId");

-- AddForeignKey
ALTER TABLE "BridgeVirtualAccount" ADD CONSTRAINT "BridgeVirtualAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeVirtualAccountEvent" ADD CONSTRAINT "BridgeVirtualAccountEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeVirtualAccountEvent" ADD CONSTRAINT "BridgeVirtualAccountEvent_bridgeVirtualAccountId_fkey" FOREIGN KEY ("bridgeVirtualAccountId") REFERENCES "BridgeVirtualAccount"("bridgeVirtualAccountId") ON DELETE CASCADE ON UPDATE CASCADE;
