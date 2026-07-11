-- ============================================================
-- Migration: add_crypto_card
-- Non-Custodial Crypto Card: KYC, Card, Wallet, Transactions
-- ============================================================

-- KYC 申請（Didit provider）
CREATE TABLE "CardKycApplication" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "provider"          TEXT NOT NULL DEFAULT 'didit',
    "providerSessionId" TEXT,
    "status"            TEXT NOT NULL DEFAULT 'not_started',
    "submittedAt"       TIMESTAMP(3),
    "reviewedAt"        TIMESTAMP(3),
    "rejectionReason"   TEXT,
    "rawWebhookData"    JSONB,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardKycApplication_pkey" PRIMARY KEY ("id")
);

-- 發卡帳戶（Lithic）
CREATE TABLE "CardAccount" (
    "id"                 TEXT NOT NULL,
    "userId"             TEXT NOT NULL,
    "lithicCardToken"    TEXT NOT NULL,
    "lithicAccountToken" TEXT,
    "last4"              TEXT,
    "expiryMonth"        INTEGER,
    "expiryYear"         INTEGER,
    "status"             TEXT NOT NULL DEFAULT 'applying',
    "isVirtual"          BOOLEAN NOT NULL DEFAULT true,
    "isPhysical"         BOOLEAN NOT NULL DEFAULT false,
    "dailyLimitUsdc"     DOUBLE PRECISION NOT NULL DEFAULT 500,
    "monthlyLimitUsdc"   DOUBLE PRECISION NOT NULL DEFAULT 5000,
    "frozenAt"           TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardAccount_pkey" PRIMARY KEY ("id")
);

-- 綁定錢包 + Session Key（每用戶唯一）
CREATE TABLE "CardWallet" (
    "id"                       TEXT NOT NULL,
    "userId"                   TEXT NOT NULL,
    "chainId"                  INTEGER NOT NULL,
    "address"                  TEXT NOT NULL,
    "sessionKeyPubkey"         TEXT,
    "sessionKeyExpiry"         TIMESTAMP(3),
    "sessionKeyDailyLimitUsdc" DOUBLE PRECISION,
    "allowedContracts"         TEXT[],
    "linkedAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardWallet_pkey" PRIMARY KEY ("id")
);

-- 消費帳本
CREATE TABLE "CardTransaction" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "cardAccountId"    TEXT NOT NULL,
    "amountUsdc"       DOUBLE PRECISION NOT NULL,
    "merchantName"     TEXT,
    "merchantCategory" TEXT,
    "txHash"           TEXT,
    "lithicEventToken" TEXT,
    "status"           TEXT NOT NULL DEFAULT 'authorized',
    "authorizedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt"        TIMESTAMP(3),
    "reversedAt"       TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardTransaction_pkey" PRIMARY KEY ("id")
);

-- 每日花費追蹤
CREATE TABLE "CardDailySpend" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "date"      TEXT NOT NULL,
    "spentUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardDailySpend_pkey" PRIMARY KEY ("id")
);

-- ── Unique constraints ────────────────────────────────────────────────────────
ALTER TABLE "CardKycApplication" ADD CONSTRAINT "CardKycApplication_providerSessionId_key" UNIQUE ("providerSessionId");
ALTER TABLE "CardAccount"        ADD CONSTRAINT "CardAccount_lithicCardToken_key"           UNIQUE ("lithicCardToken");
ALTER TABLE "CardWallet"         ADD CONSTRAINT "CardWallet_userId_key"                     UNIQUE ("userId");
ALTER TABLE "CardTransaction"    ADD CONSTRAINT "CardTransaction_lithicEventToken_key"      UNIQUE ("lithicEventToken");
ALTER TABLE "CardDailySpend"     ADD CONSTRAINT "CardDailySpend_userId_date_key"            UNIQUE ("userId", "date");

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX "CardKycApplication_userId_idx"            ON "CardKycApplication"("userId");
CREATE INDEX "CardKycApplication_status_idx"            ON "CardKycApplication"("status");
CREATE INDEX "CardKycApplication_providerSessionId_idx" ON "CardKycApplication"("providerSessionId");

CREATE INDEX "CardAccount_userId_idx"           ON "CardAccount"("userId");
CREATE INDEX "CardAccount_status_idx"           ON "CardAccount"("status");
CREATE INDEX "CardAccount_lithicCardToken_idx"  ON "CardAccount"("lithicCardToken");

CREATE INDEX "CardWallet_userId_idx"  ON "CardWallet"("userId");
CREATE INDEX "CardWallet_address_idx" ON "CardWallet"("address");

CREATE INDEX "CardTransaction_userId_authorizedAt_idx" ON "CardTransaction"("userId", "authorizedAt");
CREATE INDEX "CardTransaction_userId_status_idx"       ON "CardTransaction"("userId", "status");
CREATE INDEX "CardTransaction_cardAccountId_idx"       ON "CardTransaction"("cardAccountId");
CREATE INDEX "CardTransaction_lithicEventToken_idx"    ON "CardTransaction"("lithicEventToken");

CREATE INDEX "CardDailySpend_userId_idx" ON "CardDailySpend"("userId");
CREATE INDEX "CardDailySpend_date_idx"   ON "CardDailySpend"("date");

-- ── Foreign keys ──────────────────────────────────────────────────────────────
ALTER TABLE "CardKycApplication" ADD CONSTRAINT "CardKycApplication_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardAccount" ADD CONSTRAINT "CardAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardWallet" ADD CONSTRAINT "CardWallet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardTransaction" ADD CONSTRAINT "CardTransaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardTransaction" ADD CONSTRAINT "CardTransaction_cardAccountId_fkey"
    FOREIGN KEY ("cardAccountId") REFERENCES "CardAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardDailySpend" ADD CONSTRAINT "CardDailySpend_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
