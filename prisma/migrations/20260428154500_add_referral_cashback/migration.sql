-- Add cashback balance to users
ALTER TABLE "User"
ADD COLUMN "cashbackBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Referral cashback ledger
CREATE TABLE "ReferralCashback" (
  "id" TEXT NOT NULL,
  "inviterUserId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "stripeInvoiceId" TEXT NOT NULL,
  "stripeSubscriptionId" TEXT,
  "grossAmount" DOUBLE PRECISION NOT NULL,
  "cashbackAmount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralCashback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralCashback_stripeInvoiceId_key" ON "ReferralCashback"("stripeInvoiceId");
CREATE INDEX "ReferralCashback_inviterUserId_createdAt_idx" ON "ReferralCashback"("inviterUserId", "createdAt");
CREATE INDEX "ReferralCashback_referredUserId_createdAt_idx" ON "ReferralCashback"("referredUserId", "createdAt");

ALTER TABLE "ReferralCashback"
ADD CONSTRAINT "ReferralCashback_inviterUserId_fkey"
FOREIGN KEY ("inviterUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralCashback"
ADD CONSTRAINT "ReferralCashback_referredUserId_fkey"
FOREIGN KEY ("referredUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
