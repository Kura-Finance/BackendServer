-- Persist Bridge KYC rejection / pause reasons for frontend messaging.
ALTER TABLE "BridgeCustomer" ADD COLUMN IF NOT EXISTS "rejectionReasons" JSONB;
