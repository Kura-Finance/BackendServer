-- Multi-treasury workspace (org Safes separate from personal SCA)
ALTER TABLE "User" ADD COLUMN "activeTreasuryId" TEXT;

CREATE TABLE "Treasury" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "saltNonce" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Treasury_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Treasury_userId_address_key" ON "Treasury"("userId", "address");
CREATE INDEX "Treasury_userId_idx" ON "Treasury"("userId");

ALTER TABLE "Treasury" ADD CONSTRAINT "Treasury_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
