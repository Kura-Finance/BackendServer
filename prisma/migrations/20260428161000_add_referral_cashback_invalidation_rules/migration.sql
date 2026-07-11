-- Add lifecycle fields for referral cashback invalidation rules
ALTER TABLE "ReferralCashback"
ADD COLUMN "stripeChargeId" TEXT,
ADD COLUMN "status" TEXT,
ADD COLUMN "availableAt" TIMESTAMP(3),
ADD COLUMN "settledAt" TIMESTAMP(3),
ADD COLUMN "reversedAt" TIMESTAMP(3),
ADD COLUMN "reverseReason" TEXT,
ADD COLUMN "reversedByEventId" TEXT;

-- Existing records were already credited immediately in previous logic.
UPDATE "ReferralCashback"
SET
  "status" = 'available',
  "availableAt" = "createdAt",
  "settledAt" = "createdAt"
WHERE "status" IS NULL;

ALTER TABLE "ReferralCashback"
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'pending',
ALTER COLUMN "availableAt" SET NOT NULL;

CREATE INDEX "ReferralCashback_status_availableAt_idx"
ON "ReferralCashback"("status", "availableAt");

CREATE INDEX "ReferralCashback_stripeChargeId_idx"
ON "ReferralCashback"("stripeChargeId");
