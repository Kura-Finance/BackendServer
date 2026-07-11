-- Persist Bridge VA event source (payer name, payment rail, account last 4, etc.)
ALTER TABLE "BridgeVirtualAccountEvent" ADD COLUMN "source" JSONB;
