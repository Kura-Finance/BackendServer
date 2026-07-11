-- Platform investor reporting + SCA AUM snapshots
CREATE TABLE "PlatformRevenueEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "grossAmount" DOUBLE PRECISION,
    "platformFee" DOUBLE PRECISION,
    "netAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "externalId" TEXT,
    "depositId" TEXT,
    "scaAddress" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRevenueEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScaWalletSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scaAddress" TEXT NOT NULL,
    "spotUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defiUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'debank',
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScaWalletSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScaScanRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "walletsScanned" INTEGER NOT NULL DEFAULT 0,
    "walletsFailed" INTEGER NOT NULL DEFAULT 0,
    "totalAumUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "ScaScanRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformRevenueEvent_idempotencyKey_key" ON "PlatformRevenueEvent"("idempotencyKey");
CREATE INDEX "PlatformRevenueEvent_source_occurredAt_idx" ON "PlatformRevenueEvent"("source", "occurredAt");
CREATE INDEX "PlatformRevenueEvent_userId_occurredAt_idx" ON "PlatformRevenueEvent"("userId", "occurredAt");
CREATE INDEX "PlatformRevenueEvent_occurredAt_idx" ON "PlatformRevenueEvent"("occurredAt");
CREATE INDEX "PlatformRevenueEvent_eventType_idx" ON "PlatformRevenueEvent"("eventType");

CREATE INDEX "ScaWalletSnapshot_userId_snapshotAt_idx" ON "ScaWalletSnapshot"("userId", "snapshotAt");
CREATE INDEX "ScaWalletSnapshot_scaAddress_snapshotAt_idx" ON "ScaWalletSnapshot"("scaAddress", "snapshotAt");
CREATE INDEX "ScaWalletSnapshot_snapshotAt_idx" ON "ScaWalletSnapshot"("snapshotAt");

CREATE INDEX "ScaScanRun_startedAt_idx" ON "ScaScanRun"("startedAt");
CREATE INDEX "ScaScanRun_status_idx" ON "ScaScanRun"("status");

CREATE INDEX "User_scaAddress_idx" ON "User"("scaAddress");

ALTER TABLE "PlatformRevenueEvent" ADD CONSTRAINT "PlatformRevenueEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScaWalletSnapshot" ADD CONSTRAINT "ScaWalletSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
