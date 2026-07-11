-- =====================================================
-- Rollup migration: referral + cashback + asset snapshots
-- Safe to run once on environments with partial changes.
-- =====================================================

-- -----------------------------
-- 1) User referral fields
-- -----------------------------
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "referCode" TEXT,
ADD COLUMN IF NOT EXISTS "referredByUserId" TEXT,
ADD COLUMN IF NOT EXISTS "referredAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "cashbackBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill referral code for existing users (only null rows)
UPDATE "User"
SET "referCode" = 'RF' || UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 12))
WHERE "referCode" IS NULL;

-- Ensure referCode is NOT NULL
ALTER TABLE "User"
ALTER COLUMN "referCode" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "User_referCode_key" ON "User"("referCode");
CREATE INDEX IF NOT EXISTS "User_referredByUserId_idx" ON "User"("referredByUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_referredByUserId_fkey'
  ) THEN
    ALTER TABLE "User"
    ADD CONSTRAINT "User_referredByUserId_fkey"
    FOREIGN KEY ("referredByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- -----------------------------
-- 2) Referral cashback ledger
-- -----------------------------
CREATE TABLE IF NOT EXISTS "ReferralCashback" (
  "id" TEXT NOT NULL,
  "inviterUserId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "stripeInvoiceId" TEXT NOT NULL,
  "stripeChargeId" TEXT,
  "stripeSubscriptionId" TEXT,
  "grossAmount" DOUBLE PRECISION NOT NULL,
  "cashbackAmount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "availableAt" TIMESTAMP(3) NOT NULL,
  "settledAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "reverseReason" TEXT,
  "reversedByEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralCashback_pkey" PRIMARY KEY ("id")
);

-- If table already existed with old shape, add missing columns safely
ALTER TABLE "ReferralCashback"
ADD COLUMN IF NOT EXISTS "stripeChargeId" TEXT,
ADD COLUMN IF NOT EXISTS "status" TEXT,
ADD COLUMN IF NOT EXISTS "availableAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reverseReason" TEXT,
ADD COLUMN IF NOT EXISTS "reversedByEventId" TEXT;

-- Backfill defaults for pre-existing rows
UPDATE "ReferralCashback"
SET
  "status" = COALESCE("status", 'available'),
  "availableAt" = COALESCE("availableAt", "createdAt"),
  "settledAt" = COALESCE("settledAt", "createdAt")
WHERE "status" IS NULL
   OR "availableAt" IS NULL;

ALTER TABLE "ReferralCashback"
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'pending',
ALTER COLUMN "availableAt" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralCashback_stripeInvoiceId_key"
ON "ReferralCashback"("stripeInvoiceId");

CREATE INDEX IF NOT EXISTS "ReferralCashback_inviterUserId_createdAt_idx"
ON "ReferralCashback"("inviterUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "ReferralCashback_referredUserId_createdAt_idx"
ON "ReferralCashback"("referredUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "ReferralCashback_status_availableAt_idx"
ON "ReferralCashback"("status", "availableAt");

CREATE INDEX IF NOT EXISTS "ReferralCashback_stripeChargeId_idx"
ON "ReferralCashback"("stripeChargeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ReferralCashback_inviterUserId_fkey'
  ) THEN
    ALTER TABLE "ReferralCashback"
    ADD CONSTRAINT "ReferralCashback_inviterUserId_fkey"
    FOREIGN KEY ("inviterUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ReferralCashback_referredUserId_fkey'
  ) THEN
    ALTER TABLE "ReferralCashback"
    ADD CONSTRAINT "ReferralCashback_referredUserId_fkey"
    FOREIGN KEY ("referredUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- -----------------------------
-- 3) AssetSnapshot breakdown columns
-- -----------------------------
ALTER TABLE "AssetSnapshot"
ADD COLUMN IF NOT EXISTS "cashFlow" TEXT,
ADD COLUMN IF NOT EXISTS "plaidInvestment" TEXT,
ADD COLUMN IF NOT EXISTS "cryptoSpot" TEXT,
ADD COLUMN IF NOT EXISTS "defiProtocol" TEXT;

-- -----------------------------
-- 4) Cleanup legacy asset snapshots
-- Keep only composite snapshots.
-- -----------------------------
DELETE FROM "AssetSnapshot"
WHERE "type" <> 'composite';

-- Re-sync AssetPerformance from latest composite snapshot
WITH latest_composite AS (
  SELECT DISTINCT ON ("userId")
    "userId",
    "value",
    "recordedAt"
  FROM "AssetSnapshot"
  WHERE "type" = 'composite'
  ORDER BY "userId", "recordedAt" DESC
)
UPDATE "AssetPerformance" ap
SET
  "totalAssets" = lc."value",
  "lastRecordedTime" = lc."recordedAt",
  "updatedAt" = NOW()
FROM latest_composite lc
WHERE ap."userId" = lc."userId";
