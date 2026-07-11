-- Multi-source referral cashback (Bridge, Dinari, Stripe, …)
ALTER TABLE "ReferralCashback" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE "ReferralCashback" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "ReferralCashback" ADD COLUMN "externalId" TEXT;
ALTER TABLE "ReferralCashback" ADD COLUMN "eventType" TEXT;

UPDATE "ReferralCashback"
SET "idempotencyKey" = 'referral:stripe:invoice:' || "stripeInvoiceId"
WHERE "idempotencyKey" IS NULL AND "stripeInvoiceId" IS NOT NULL;

ALTER TABLE "ReferralCashback" ALTER COLUMN "idempotencyKey" SET NOT NULL;
ALTER TABLE "ReferralCashback" ALTER COLUMN "stripeInvoiceId" DROP NOT NULL;

DROP INDEX IF EXISTS "ReferralCashback_stripeInvoiceId_key";
CREATE UNIQUE INDEX "ReferralCashback_idempotencyKey_key" ON "ReferralCashback"("idempotencyKey");
CREATE UNIQUE INDEX "ReferralCashback_stripeInvoiceId_key" ON "ReferralCashback"("stripeInvoiceId") WHERE "stripeInvoiceId" IS NOT NULL;

CREATE INDEX "ReferralCashback_source_createdAt_idx" ON "ReferralCashback"("source", "createdAt");
