-- ============================================================
-- Migration: add_passkey
-- Server-side WebAuthn/Passkey: credentials + challenges + wrapped DEK.
-- ============================================================

-- 已註冊的 WebAuthn 憑證
CREATE TABLE "PasskeyCredential" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey"    TEXT NOT NULL,
    "counter"      INTEGER NOT NULL DEFAULT 0,
    "transports"   TEXT[],
    "deviceType"   TEXT,
    "backedUp"     BOOLEAN NOT NULL DEFAULT false,
    "encryptedDek" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt"   TIMESTAMP(3),

    CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);

-- 進行中的 WebAuthn challenge（每個 user 同時只有一個）
CREATE TABLE "WebAuthnChallenge" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "PasskeyCredential_credentialId_key" ON "PasskeyCredential"("credentialId");
CREATE UNIQUE INDEX "WebAuthnChallenge_userId_key" ON "WebAuthnChallenge"("userId");

-- Indexes
CREATE INDEX "PasskeyCredential_userId_idx" ON "PasskeyCredential"("userId");
CREATE INDEX "PasskeyCredential_credentialId_idx" ON "PasskeyCredential"("credentialId");
CREATE INDEX "WebAuthnChallenge_expiresAt_idx" ON "WebAuthnChallenge"("expiresAt");

-- Foreign keys
ALTER TABLE "PasskeyCredential" ADD CONSTRAINT "PasskeyCredential_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebAuthnChallenge" ADD CONSTRAINT "WebAuthnChallenge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
