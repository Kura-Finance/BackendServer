-- CreateTable
CREATE TABLE "PlaidAccountCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "logo" TEXT NOT NULL DEFAULT 'https://www.google.com/s2/favicons?domain=plaid.com&sz=128',
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidAccountCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidTransactionCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaidTransactionCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidInvestmentAccountCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "logo" TEXT NOT NULL DEFAULT 'https://www.google.com/s2/favicons?domain=plaid.com&sz=128',
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidInvestmentAccountCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidInvestmentCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "holdings" DOUBLE PRECISION NOT NULL,
    "currentPrice" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "logo" TEXT NOT NULL DEFAULT 'https://www.google.com/s2/favicons?domain=plaid.com&sz=128',
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidInvestmentCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidSyncLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "accountsSyncedAt" TIMESTAMP(3),
    "transactionsSyncedAt" TIMESTAMP(3),
    "investmentsSyncedAt" TIMESTAMP(3),
    "totalAccounts" INTEGER NOT NULL DEFAULT 0,
    "totalTransactions" INTEGER NOT NULL DEFAULT 0,
    "totalInvestments" INTEGER NOT NULL DEFAULT 0,
    "accountsCacheTtl" INTEGER NOT NULL DEFAULT 3600,
    "transactionsCacheTtl" INTEGER NOT NULL DEFAULT 1800,
    "investmentsCacheTtl" INTEGER NOT NULL DEFAULT 3600,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaidAccountCache_userId_idx" ON "PlaidAccountCache"("userId");

-- CreateIndex
CREATE INDEX "PlaidAccountCache_userId_plaidItemId_idx" ON "PlaidAccountCache"("userId", "plaidItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidAccountCache_userId_accountId_key" ON "PlaidAccountCache"("userId", "accountId");

-- CreateIndex
CREATE INDEX "PlaidTransactionCache_userId_idx" ON "PlaidTransactionCache"("userId");

-- CreateIndex
CREATE INDEX "PlaidTransactionCache_userId_month_idx" ON "PlaidTransactionCache"("userId", "month");

-- CreateIndex
CREATE INDEX "PlaidTransactionCache_userId_accountId_idx" ON "PlaidTransactionCache"("userId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidTransactionCache_userId_transactionId_key" ON "PlaidTransactionCache"("userId", "transactionId");

-- CreateIndex
CREATE INDEX "PlaidInvestmentAccountCache_userId_idx" ON "PlaidInvestmentAccountCache"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidInvestmentAccountCache_userId_accountId_key" ON "PlaidInvestmentAccountCache"("userId", "accountId");

-- CreateIndex
CREATE INDEX "PlaidInvestmentCache_userId_idx" ON "PlaidInvestmentCache"("userId");

-- CreateIndex
CREATE INDEX "PlaidInvestmentCache_userId_accountId_idx" ON "PlaidInvestmentCache"("userId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidInvestmentCache_userId_investmentId_key" ON "PlaidInvestmentCache"("userId", "investmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidSyncLog_userId_key" ON "PlaidSyncLog"("userId");

-- AddForeignKey
ALTER TABLE "PlaidAccountCache" ADD CONSTRAINT "PlaidAccountCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidTransactionCache" ADD CONSTRAINT "PlaidTransactionCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidInvestmentAccountCache" ADD CONSTRAINT "PlaidInvestmentAccountCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidInvestmentCache" ADD CONSTRAINT "PlaidInvestmentCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidSyncLog" ADD CONSTRAINT "PlaidSyncLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
