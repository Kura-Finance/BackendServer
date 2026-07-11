-- AlterTable
ALTER TABLE "PlaidItem" ADD COLUMN "transactionsCursor" TEXT;

-- CreateTable
CREATE TABLE "DeBankTokenCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "cacheTtl" INTEGER NOT NULL DEFAULT 300,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeBankTokenCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeBankTokenCache_userId_address_chain_tokenId_key" ON "DeBankTokenCache"("userId", "address", "chain", "tokenId");

-- CreateIndex
CREATE INDEX "DeBankTokenCache_userId_idx" ON "DeBankTokenCache"("userId");

-- CreateIndex
CREATE INDEX "DeBankTokenCache_userId_address_idx" ON "DeBankTokenCache"("userId", "address");

-- CreateIndex
CREATE INDEX "DeBankTokenCache_cachedAt_idx" ON "DeBankTokenCache"("cachedAt");

-- AddForeignKey
ALTER TABLE "DeBankTokenCache" ADD CONSTRAINT "DeBankTokenCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
