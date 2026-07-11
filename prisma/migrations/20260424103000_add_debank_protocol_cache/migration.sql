-- ========================================
-- Add DeBank protocol cache table
-- ========================================

CREATE TABLE IF NOT EXISTS "DeBankProtocolCache" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "protocolId" TEXT NOT NULL,
  "chain" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rawData" JSONB NOT NULL,
  "cacheTtl" INTEGER NOT NULL DEFAULT 300,
  "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeBankProtocolCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeBankProtocolCache_userId_address_protocolId_key"
  ON "DeBankProtocolCache"("userId", "address", "protocolId");

CREATE INDEX IF NOT EXISTS "DeBankProtocolCache_userId_idx"
  ON "DeBankProtocolCache"("userId");

CREATE INDEX IF NOT EXISTS "DeBankProtocolCache_userId_address_idx"
  ON "DeBankProtocolCache"("userId", "address");

CREATE INDEX IF NOT EXISTS "DeBankProtocolCache_cachedAt_idx"
  ON "DeBankProtocolCache"("cachedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DeBankProtocolCache_userId_fkey'
  ) THEN
    ALTER TABLE "DeBankProtocolCache"
      ADD CONSTRAINT "DeBankProtocolCache_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
