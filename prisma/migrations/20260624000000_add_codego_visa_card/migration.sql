-- Codego Visa/Mastercard Card Issuing
CREATE TABLE "CodegoCardholder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codegoUserId" TEXT,
    "externalUserId" TEXT NOT NULL,
    "applicantType" TEXT NOT NULL DEFAULT 'individual',
    "kycSessionId" TEXT,
    "iframeUrl" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "applicationStatus" TEXT,
    "applicationReason" TEXT,
    "kycStatus" TEXT,
    "canIssueCard" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodegoCardholder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CodegoCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codegoCardId" TEXT NOT NULL,
    "cardType" TEXT,
    "status" TEXT,
    "last4" TEXT,
    "brand" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodegoCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CodegoWebhookEvent" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodegoWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CodegoCardholder_userId_key" ON "CodegoCardholder"("userId");
CREATE UNIQUE INDEX "CodegoCardholder_codegoUserId_key" ON "CodegoCardholder"("codegoUserId");
CREATE UNIQUE INDEX "CodegoCardholder_externalUserId_key" ON "CodegoCardholder"("externalUserId");
CREATE INDEX "CodegoCardholder_codegoUserId_idx" ON "CodegoCardholder"("codegoUserId");
CREATE INDEX "CodegoCardholder_applicationStatus_idx" ON "CodegoCardholder"("applicationStatus");

CREATE UNIQUE INDEX "CodegoCard_codegoCardId_key" ON "CodegoCard"("codegoCardId");
CREATE INDEX "CodegoCard_userId_idx" ON "CodegoCard"("userId");
CREATE INDEX "CodegoCard_status_idx" ON "CodegoCard"("status");

CREATE UNIQUE INDEX "CodegoWebhookEvent_idempotencyKey_key" ON "CodegoWebhookEvent"("idempotencyKey");
CREATE INDEX "CodegoWebhookEvent_eventType_idx" ON "CodegoWebhookEvent"("eventType");

ALTER TABLE "CodegoCardholder" ADD CONSTRAINT "CodegoCardholder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodegoCard" ADD CONSTRAINT "CodegoCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
