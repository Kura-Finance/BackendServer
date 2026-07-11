-- Add referral fields to user table
ALTER TABLE "User"
ADD COLUMN "referCode" TEXT,
ADD COLUMN "referredByUserId" TEXT,
ADD COLUMN "referredAt" TIMESTAMP(3);

-- Backfill referral codes for existing users
UPDATE "User"
SET "referCode" = 'RF' || UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 12))
WHERE "referCode" IS NULL;

-- Enforce referCode constraints
ALTER TABLE "User"
ALTER COLUMN "referCode" SET NOT NULL;

CREATE UNIQUE INDEX "User_referCode_key" ON "User"("referCode");
CREATE INDEX "User_referredByUserId_idx" ON "User"("referredByUserId");

-- Add self-relation FK for inviter
ALTER TABLE "User"
ADD CONSTRAINT "User_referredByUserId_fkey"
FOREIGN KEY ("referredByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
