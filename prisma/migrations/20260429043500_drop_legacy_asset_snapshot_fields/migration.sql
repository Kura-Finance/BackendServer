-- Ensure composite fields are populated before dropping legacy columns
UPDATE "AssetSnapshot"
SET
  "cashFlow" = COALESCE("cashFlow", "value"),
  "plaidInvestment" = COALESCE("plaidInvestment", '0'),
  "cryptoSpot" = COALESCE("cryptoSpot", '0'),
  "defiProtocol" = COALESCE("defiProtocol", '0');

-- Remove any remaining legacy rows if legacy type exists
DELETE FROM "AssetSnapshot"
WHERE COALESCE("type", 'composite') <> 'composite';

-- Enforce non-null for four-column snapshot
ALTER TABLE "AssetSnapshot"
ALTER COLUMN "cashFlow" SET NOT NULL,
ALTER COLUMN "plaidInvestment" SET NOT NULL,
ALTER COLUMN "cryptoSpot" SET NOT NULL,
ALTER COLUMN "defiProtocol" SET NOT NULL;

-- Drop legacy columns
ALTER TABLE "AssetSnapshot"
DROP COLUMN IF EXISTS "assetId",
DROP COLUMN IF EXISTS "name",
DROP COLUMN IF EXISTS "type",
DROP COLUMN IF EXISTS "value",
DROP COLUMN IF EXISTS "currency";
