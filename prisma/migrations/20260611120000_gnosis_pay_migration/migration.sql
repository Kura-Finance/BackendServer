-- ============================================================
-- Migrate card domain from Didit/Lithic to Gnosis Pay
-- ============================================================

-- CardWallet: drop Lithic session key columns, add GP columns
ALTER TABLE "CardWallet"
  DROP COLUMN IF EXISTS "sessionKeyPubkey",
  DROP COLUMN IF EXISTS "sessionKeyExpiry",
  DROP COLUMN IF EXISTS "sessionKeyDailyLimitUsdc",
  DROP COLUMN IF EXISTS "allowedContracts";

ALTER TABLE "CardWallet"
  ADD COLUMN IF NOT EXISTS "gpJwt"           TEXT,
  ADD COLUMN IF NOT EXISTS "gpJwtExpiresAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "gpTermsAccepted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "gpPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "gpSofCompleted"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "gpKycStatus"     TEXT,
  ADD COLUMN IF NOT EXISTS "gpAccountStatus" INTEGER,
  ADD COLUMN IF NOT EXISTS "gpSafeAddress"   TEXT,
  ADD COLUMN IF NOT EXISTS "gpCurrency"      TEXT,
  ADD COLUMN IF NOT EXISTS "gpCardId"        TEXT;

-- Update chainId default to 100 (Gnosis Chain) for new rows
ALTER TABLE "CardWallet" ALTER COLUMN "chainId" SET DEFAULT 100;

-- CardAccount: rename Lithic columns to provider-agnostic names
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='CardAccount' AND column_name='lithicCardToken') THEN
    ALTER TABLE "CardAccount" RENAME COLUMN "lithicCardToken" TO "providerCardId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='CardAccount' AND column_name='lithicAccountToken') THEN
    ALTER TABLE "CardAccount" RENAME COLUMN "lithicAccountToken" TO "providerAccountId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='CardAccount' AND column_name='dailyLimitUsdc') THEN
    ALTER TABLE "CardAccount" RENAME COLUMN "dailyLimitUsdc" TO "dailyLimitEure";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='CardAccount' AND column_name='monthlyLimitUsdc') THEN
    ALTER TABLE "CardAccount" RENAME COLUMN "monthlyLimitUsdc" TO "monthlyLimitEure";
  END IF;
END $$;

ALTER TABLE "CardAccount"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'EURe';

-- CardTransaction: rename Lithic event token, add GP fields
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='CardTransaction' AND column_name='lithicEventToken') THEN
    ALTER TABLE "CardTransaction" RENAME COLUMN "lithicEventToken" TO "providerEventId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='CardTransaction' AND column_name='amountUsdc') THEN
    ALTER TABLE "CardTransaction" RENAME COLUMN "amountUsdc" TO "amount";
  END IF;
END $$;

ALTER TABLE "CardTransaction"
  ADD COLUMN IF NOT EXISTS "currency"  TEXT NOT NULL DEFAULT 'EURe',
  ADD COLUMN IF NOT EXISTS "kind"      TEXT NOT NULL DEFAULT 'Payment',
  ADD COLUMN IF NOT EXISTS "isPending" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "clearedAt" TIMESTAMP(3);

-- CardKycApplication: update default provider
UPDATE "CardKycApplication" SET "provider" = 'gnosispay' WHERE "provider" = 'didit';

-- Indexes
CREATE INDEX IF NOT EXISTS "CardWallet_gpSafeAddress_idx" ON "CardWallet"("gpSafeAddress");
