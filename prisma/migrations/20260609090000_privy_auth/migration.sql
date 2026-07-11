-- ============================================================
-- Migration: privy_auth
-- Replace SRP authentication with Privy; bind embedded wallet.
-- Greenfield: SRP columns and the VerificationCode table are dropped.
-- ============================================================

-- Drop the verification-code system (register / password-reset / email-change)
DROP TABLE IF EXISTS "VerificationCode";

-- User: add Privy identity + wallet, drop SRP fields, allow null email
ALTER TABLE "User"
  ADD COLUMN "privyUserId"   TEXT,
  ADD COLUMN "walletAddress" TEXT;

ALTER TABLE "User" DROP COLUMN IF EXISTS "srpSalt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "srpVerifier";
ALTER TABLE "User" DROP COLUMN IF EXISTS "encryptedDataKey";

-- email is now optional (Privy wallet/social logins may not provide one)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- privyUserId is the external identity key
CREATE UNIQUE INDEX "User_privyUserId_key" ON "User"("privyUserId");
