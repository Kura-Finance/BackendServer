-- Track when customer-named fiat payout was configured on Bridge (USD wire, etc.)
ALTER TABLE "BridgeCustomer" ADD COLUMN "customerNamedPayoutAt" TIMESTAMP(3);
