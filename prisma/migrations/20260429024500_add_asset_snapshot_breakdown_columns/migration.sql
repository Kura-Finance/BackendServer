-- Add four breakdown columns for composite asset snapshots
ALTER TABLE "AssetSnapshot"
ADD COLUMN "cashFlow" TEXT,
ADD COLUMN "plaidInvestment" TEXT,
ADD COLUMN "cryptoSpot" TEXT,
ADD COLUMN "defiProtocol" TEXT;
