-- Bridge Funds Requests (bank / fraud recalls)
CREATE TABLE "BridgeFundsRequest" (
    "id" TEXT NOT NULL,
    "bridgeFundsRequestId" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "bridgeCustomerId" TEXT,
    "userId" TEXT,
    "fraud" BOOLEAN NOT NULL DEFAULT false,
    "amount" TEXT,
    "currency" TEXT,
    "noticeCreatedAt" TIMESTAMP(3),
    "depositCreatedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "returnTransferId" TEXT,
    "returnError" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeFundsRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BridgeFundsRequest_bridgeFundsRequestId_key" ON "BridgeFundsRequest"("bridgeFundsRequestId");
CREATE INDEX "BridgeFundsRequest_depositId_idx" ON "BridgeFundsRequest"("depositId");
CREATE INDEX "BridgeFundsRequest_fraud_idx" ON "BridgeFundsRequest"("fraud");
CREATE INDEX "BridgeFundsRequest_status_idx" ON "BridgeFundsRequest"("status");
CREATE INDEX "BridgeFundsRequest_userId_idx" ON "BridgeFundsRequest"("userId");
CREATE INDEX "BridgeFundsRequest_noticeCreatedAt_idx" ON "BridgeFundsRequest"("noticeCreatedAt");
CREATE INDEX "BridgeFundsRequest_lastSyncedAt_idx" ON "BridgeFundsRequest"("lastSyncedAt");

ALTER TABLE "BridgeFundsRequest"
  ADD CONSTRAINT "BridgeFundsRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
