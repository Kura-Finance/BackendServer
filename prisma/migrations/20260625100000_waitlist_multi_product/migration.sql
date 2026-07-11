-- Allow one email to join multiple product waitlists
ALTER TABLE "WaitlistEntry" ADD COLUMN "product" TEXT NOT NULL DEFAULT 'default';

DROP INDEX "WaitlistEntry_email_key";

CREATE UNIQUE INDEX "WaitlistEntry_email_product_key" ON "WaitlistEntry"("email", "product");
CREATE INDEX "WaitlistEntry_product_idx" ON "WaitlistEntry"("product");
