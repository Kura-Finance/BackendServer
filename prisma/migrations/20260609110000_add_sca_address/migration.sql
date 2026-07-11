-- Add scaAddress to User: ERC-4337 Smart Contract Account address for payment settlement
ALTER TABLE "User" ADD COLUMN "scaAddress" TEXT;
