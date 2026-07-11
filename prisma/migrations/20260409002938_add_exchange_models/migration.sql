-- CreateTable
CREATE TABLE "ExchangeAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "exchangeDisplayName" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "passphrase" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeBalanceCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchangeAccountId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "free" DOUBLE PRECISION NOT NULL,
    "used" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "cacheTtl" INTEGER NOT NULL DEFAULT 300,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeBalanceCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeAssetCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchangeAccountId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "holdings" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "percentageOfTotal" DOUBLE PRECISION NOT NULL,
    "cacheTtl" INTEGER NOT NULL DEFAULT 300,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeAssetCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeSyncLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "balancesSyncedAt" TIMESTAMP(3),
    "assetsSyncedAt" TIMESTAMP(3),
    "balanceCacheTtl" INTEGER NOT NULL DEFAULT 300,
    "assetCacheTtl" INTEGER NOT NULL DEFAULT 300,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeAccount_userId_idx" ON "ExchangeAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeAccount_userId_exchange_key" ON "ExchangeAccount"("userId", "exchange");

-- CreateIndex
CREATE INDEX "ExchangeBalanceCache_userId_idx" ON "ExchangeBalanceCache"("userId");

-- CreateIndex
CREATE INDEX "ExchangeBalanceCache_userId_exchangeAccountId_idx" ON "ExchangeBalanceCache"("userId", "exchangeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeBalanceCache_userId_exchangeAccountId_symbol_key" ON "ExchangeBalanceCache"("userId", "exchangeAccountId", "symbol");

-- CreateIndex
CREATE INDEX "ExchangeAssetCache_userId_idx" ON "ExchangeAssetCache"("userId");

-- CreateIndex
CREATE INDEX "ExchangeAssetCache_userId_exchangeAccountId_idx" ON "ExchangeAssetCache"("userId", "exchangeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeAssetCache_userId_exchangeAccountId_symbol_key" ON "ExchangeAssetCache"("userId", "exchangeAccountId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeSyncLog_userId_key" ON "ExchangeSyncLog"("userId");

-- AddForeignKey
ALTER TABLE "ExchangeAccount" ADD CONSTRAINT "ExchangeAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeBalanceCache" ADD CONSTRAINT "ExchangeBalanceCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeAssetCache" ADD CONSTRAINT "ExchangeAssetCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeSyncLog" ADD CONSTRAINT "ExchangeSyncLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
