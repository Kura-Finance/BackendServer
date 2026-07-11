-- ============================================================
-- Bridge On/Off Ramp (fiat <-> stablecoin)
-- Adds BridgeCustomer, BridgeExternalAccount, BridgeTransfer, BridgeWebhookEvent
-- ============================================================

-- CreateTable
CREATE TABLE "BridgeCustomer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bridgeCustomerId" TEXT,
    "kycLinkId" TEXT,
    "customerType" TEXT NOT NULL DEFAULT 'individual',
    "email" TEXT,
    "fullName" TEXT,
    "kycLink" TEXT,
    "tosLink" TEXT,
    "kycStatus" TEXT NOT NULL DEFAULT 'not_started',
    "tosStatus" TEXT NOT NULL DEFAULT 'pending',
    "endorsements" JSONB,
    "rawCustomer" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeExternalAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bridgeExternalAccountId" TEXT NOT NULL,
    "bridgeCustomerId" TEXT,
    "bankName" TEXT,
    "accountOwnerName" TEXT,
    "last4" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rawAccount" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeExternalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeTransfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bridgeCustomerId" TEXT,
    "bridgeTransferId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'awaiting_funds',
    "amount" TEXT,
    "developerFee" TEXT,
    "sourceRail" TEXT,
    "sourceCurrency" TEXT,
    "destinationRail" TEXT,
    "destinationCurrency" TEXT,
    "destinationAddress" TEXT,
    "destinationExternalId" TEXT,
    "destinationTxHash" TEXT,
    "depositInstructions" JSONB,
    "clientReferenceId" TEXT,
    "rawTransfer" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeWebhookEvent" (
    "id" TEXT NOT NULL,
    "bridgeEventId" TEXT NOT NULL,
    "eventCategory" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BridgeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BridgeCustomer_userId_key" ON "BridgeCustomer"("userId");
CREATE UNIQUE INDEX "BridgeCustomer_bridgeCustomerId_key" ON "BridgeCustomer"("bridgeCustomerId");
CREATE UNIQUE INDEX "BridgeCustomer_kycLinkId_key" ON "BridgeCustomer"("kycLinkId");
CREATE INDEX "BridgeCustomer_userId_idx" ON "BridgeCustomer"("userId");
CREATE INDEX "BridgeCustomer_bridgeCustomerId_idx" ON "BridgeCustomer"("bridgeCustomerId");
CREATE INDEX "BridgeCustomer_kycStatus_idx" ON "BridgeCustomer"("kycStatus");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeExternalAccount_bridgeExternalAccountId_key" ON "BridgeExternalAccount"("bridgeExternalAccountId");
CREATE INDEX "BridgeExternalAccount_userId_idx" ON "BridgeExternalAccount"("userId");
CREATE INDEX "BridgeExternalAccount_bridgeCustomerId_idx" ON "BridgeExternalAccount"("bridgeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeTransfer_bridgeTransferId_key" ON "BridgeTransfer"("bridgeTransferId");
CREATE INDEX "BridgeTransfer_userId_createdAt_idx" ON "BridgeTransfer"("userId", "createdAt");
CREATE INDEX "BridgeTransfer_userId_direction_idx" ON "BridgeTransfer"("userId", "direction");
CREATE INDEX "BridgeTransfer_state_idx" ON "BridgeTransfer"("state");
CREATE INDEX "BridgeTransfer_bridgeTransferId_idx" ON "BridgeTransfer"("bridgeTransferId");
CREATE INDEX "BridgeTransfer_bridgeCustomerId_idx" ON "BridgeTransfer"("bridgeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeWebhookEvent_bridgeEventId_key" ON "BridgeWebhookEvent"("bridgeEventId");
CREATE INDEX "BridgeWebhookEvent_eventType_idx" ON "BridgeWebhookEvent"("eventType");

-- AddForeignKey
ALTER TABLE "BridgeCustomer" ADD CONSTRAINT "BridgeCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeExternalAccount" ADD CONSTRAINT "BridgeExternalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeTransfer" ADD CONSTRAINT "BridgeTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
