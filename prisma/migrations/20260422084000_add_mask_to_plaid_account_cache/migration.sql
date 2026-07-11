-- AlterTable: add mask (last 4 digits of account number) to PlaidAccountCache
ALTER TABLE "PlaidAccountCache" ADD COLUMN IF NOT EXISTS "mask" TEXT;
