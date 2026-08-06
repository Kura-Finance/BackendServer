-- AlterTable: platform fraud suspend (Bridge Fraud Alert policy)
ALTER TABLE "User" ADD COLUMN "fraudSuspendedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "fraudSuspendReason" TEXT;
ALTER TABLE "User" ADD COLUMN "fraudSuspendFundsRequestId" TEXT;

-- CreateIndex: fraud-rate queries by deposit month (US attribution)
CREATE INDEX "BridgeFundsRequest_depositCreatedAt_idx" ON "BridgeFundsRequest"("depositCreatedAt");
