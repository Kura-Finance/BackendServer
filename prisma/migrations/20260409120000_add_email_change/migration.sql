-- AlterTable
ALTER TABLE "User" ADD COLUMN "pendingEmailChange" TEXT,
ADD COLUMN "emailChangeCode" TEXT,
ADD COLUMN "emailChangeExpiresAt" TIMESTAMP(3);
