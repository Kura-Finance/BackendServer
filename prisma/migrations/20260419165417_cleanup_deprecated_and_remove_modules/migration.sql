-- ========================================
-- Add tier and points fields to User Table
-- ========================================

ALTER TABLE "User" ADD COLUMN "tier" TEXT NOT NULL DEFAULT 'Basic';
ALTER TABLE "User" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;

-- ========================================
-- Remove Deprecated Fields from User Table
-- ========================================

ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerificationCode";
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerificationExpiresAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "pendingEmailChange";
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailChangeCode";
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailChangeExpiresAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordResetCode";
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordResetExpiresAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "resetToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "resetTokenExpiry";

-- ========================================
-- Remove Forum Module Tables
-- ========================================

-- Drop Forum module tables in correct order (handle foreign keys)
DROP TABLE IF EXISTS "ForumPostVote" CASCADE;
DROP TABLE IF EXISTS "ForumComment" CASCADE;
DROP TABLE IF EXISTS "ForumPost" CASCADE;
DROP TABLE IF EXISTS "ForumCategory" CASCADE;

-- ========================================
-- Remove Reward Hunter Module Tables
-- ========================================

-- Drop Reward Hunter module tables in correct order (handle foreign keys)
DROP TABLE IF EXISTS "UserHunt" CASCADE;
DROP TABLE IF EXISTS "HunterOffer" CASCADE;
DROP TABLE IF EXISTS "CreditCard" CASCADE;
DROP TABLE IF EXISTS "RewardTransaction" CASCADE;
DROP TABLE IF EXISTS "RewardProfile" CASCADE;
