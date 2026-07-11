-- DropForeignKey
ALTER TABLE "public"."Web3Wallet" DROP CONSTRAINT "Web3Wallet_userId_fkey";

-- DropIndex
DROP INDEX "public"."Web3Wallet_address_key";

-- DropTable
DROP TABLE "public"."Web3Wallet";
