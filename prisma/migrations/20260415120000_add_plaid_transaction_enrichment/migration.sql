-- AlterTable
ALTER TABLE "PlaidTransactionCache" 
ADD COLUMN "personalFinanceCategory" TEXT,
ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recurringFrequency" TEXT,
ADD COLUMN "isSubscription" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "enrichedMerchantName" TEXT,
ADD COLUMN "merchantLogo" TEXT,
ADD COLUMN "merchantCategory" TEXT,
ADD COLUMN "lastWebhookUpdate" TIMESTAMP(3),
ADD COLUMN "isPending" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PlaidTransactionCache_userId_isRecurring_idx" ON "PlaidTransactionCache"("userId", "isRecurring");

-- CreateIndex
CREATE INDEX "PlaidTransactionCache_userId_isSubscription_idx" ON "PlaidTransactionCache"("userId", "isSubscription");

-- CreateIndex
CREATE INDEX "PlaidTransactionCache_userId_personalFinanceCategory_idx" ON "PlaidTransactionCache"("userId", "personalFinanceCategory");
