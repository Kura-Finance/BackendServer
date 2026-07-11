-- CreateTable
CREATE TABLE "ApiOperationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiOperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiOperationLog_userId_idx" ON "ApiOperationLog"("userId");

-- CreateIndex
CREATE INDEX "ApiOperationLog_date_idx" ON "ApiOperationLog"("date");

-- CreateIndex
CREATE INDEX "ApiOperationLog_operationType_idx" ON "ApiOperationLog"("operationType");

-- CreateIndex
CREATE UNIQUE INDEX "ApiOperationLog_userId_operationType_date_key" ON "ApiOperationLog"("userId", "operationType", "date");

-- AddForeignKey
ALTER TABLE "ApiOperationLog" ADD CONSTRAINT "ApiOperationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
