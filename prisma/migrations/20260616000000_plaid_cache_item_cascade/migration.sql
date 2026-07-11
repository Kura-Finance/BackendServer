-- AlterTable
ALTER TABLE "PlaidAccountCache" ALTER COLUMN "plaidItemId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PlaidInvestmentAccountCache" ADD COLUMN     "plaidItemId" TEXT;

-- AlterTable
ALTER TABLE "PlaidInvestmentCache" ADD COLUMN     "plaidItemId" TEXT;

-- CreateIndex
CREATE INDEX "PlaidAccountCache_plaidItemId_idx" ON "PlaidAccountCache"("plaidItemId");

-- CreateIndex
CREATE INDEX "PlaidTransactionCache_plaidItemId_idx" ON "PlaidTransactionCache"("plaidItemId");

-- CreateIndex
CREATE INDEX "PlaidInvestmentAccountCache_userId_plaidItemId_idx" ON "PlaidInvestmentAccountCache"("userId", "plaidItemId");

-- CreateIndex
CREATE INDEX "PlaidInvestmentAccountCache_plaidItemId_idx" ON "PlaidInvestmentAccountCache"("plaidItemId");

-- CreateIndex
CREATE INDEX "PlaidInvestmentCache_userId_plaidItemId_idx" ON "PlaidInvestmentCache"("userId", "plaidItemId");

-- CreateIndex
CREATE INDEX "PlaidInvestmentCache_plaidItemId_idx" ON "PlaidInvestmentCache"("plaidItemId");

-- 清除歷史孤兒資料：
-- 舊版 disconnect 只刪除 PlaidItem 而未連帶清除 cache，導致這些表殘留指向「已不存在
-- PlaidItem」的 row。在加上外鍵約束前必須先移除這些孤兒 row，否則約束驗證既有資料時會
-- 失敗（insert or update violates foreign key constraint）。這些 row 本就屬於已斷線的
-- Item，刪除即為正確清理；plaidItemId 為 NULL 的 row（aggregation 流程）保留不動。
-- 註：PlaidInvestmentAccountCache / PlaidInvestmentCache 的 plaidItemId 欄位為本次 migration
-- 新增，既有 row 皆為 NULL，故不需清理。
DELETE FROM "PlaidAccountCache" WHERE "plaidItemId" IS NOT NULL AND "plaidItemId" NOT IN (SELECT "id" FROM "PlaidItem");
DELETE FROM "PlaidTransactionCache" WHERE "plaidItemId" IS NOT NULL AND "plaidItemId" NOT IN (SELECT "id" FROM "PlaidItem");

-- AddForeignKey
ALTER TABLE "PlaidAccountCache" ADD CONSTRAINT "PlaidAccountCache_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidTransactionCache" ADD CONSTRAINT "PlaidTransactionCache_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidInvestmentAccountCache" ADD CONSTRAINT "PlaidInvestmentAccountCache_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidInvestmentCache" ADD CONSTRAINT "PlaidInvestmentCache_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
