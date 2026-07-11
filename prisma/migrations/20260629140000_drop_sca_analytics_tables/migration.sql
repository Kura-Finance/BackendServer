-- Remove legacy SCA / DeBank AUM analytics (replaced by Privy active users).

DELETE FROM "PlatformRecord" WHERE "category" = 'aum';

DROP TABLE IF EXISTS "ScaWalletSnapshot";
DROP TABLE IF EXISTS "ScaScanRun";
