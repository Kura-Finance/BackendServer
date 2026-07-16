-- Referral cashback withdrawal requests (manual payout + Support email)
CREATE TABLE "ReferralCashbackWithdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "destinationAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralCashbackWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReferralCashbackWithdrawal_userId_createdAt_idx" ON "ReferralCashbackWithdrawal"("userId", "createdAt");
CREATE INDEX "ReferralCashbackWithdrawal_status_createdAt_idx" ON "ReferralCashbackWithdrawal"("status", "createdAt");

ALTER TABLE "ReferralCashbackWithdrawal"
    ADD CONSTRAINT "ReferralCashbackWithdrawal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
