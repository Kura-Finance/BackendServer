-- Phase 1 schema cleanup: dead columns, unused ExchangeSyncLog, redundant indexes

DROP TABLE IF EXISTS "ExchangeSyncLog" CASCADE;

ALTER TABLE "User" DROP COLUMN IF EXISTS "points";
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerified";

ALTER TABLE "ExchangeBalanceCache" DROP COLUMN IF EXISTS "cacheTtl";
ALTER TABLE "ExchangeAssetCache" DROP COLUMN IF EXISTS "cacheTtl";
ALTER TABLE "DeBankProtocolCache" DROP COLUMN IF EXISTS "cacheTtl";
ALTER TABLE "DeBankTokenCache" DROP COLUMN IF EXISTS "cacheTtl";

DROP INDEX IF EXISTS "PasskeyCredential_credentialId_idx";
DROP INDEX IF EXISTS "BridgeCustomer_userId_idx";
DROP INDEX IF EXISTS "BridgeCustomer_bridgeCustomerId_idx";
DROP INDEX IF EXISTS "NotificationPreferences_userId_idx";
