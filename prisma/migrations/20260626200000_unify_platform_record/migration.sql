-- Unify investor datastore: PlatformRevenueEvent → PlatformRecord + waitlist/liquidation fields
ALTER TABLE "PlatformRevenueEvent" RENAME TO "PlatformRecord";

ALTER TABLE "PlatformRecord" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'revenue';
ALTER TABLE "PlatformRecord" ADD COLUMN "product" TEXT;
ALTER TABLE "PlatformRecord" ADD COLUMN "email" TEXT;

CREATE INDEX "PlatformRecord_category_occurredAt_idx" ON "PlatformRecord"("category", "occurredAt");
CREATE INDEX "PlatformRecord_product_idx" ON "PlatformRecord"("product");
