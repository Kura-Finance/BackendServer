-- Drop Gnosis Pay card tables (replaced by Codego card issuing)

DROP TABLE IF EXISTS "CardTransaction" CASCADE;
DROP TABLE IF EXISTS "CardAccount" CASCADE;
DROP TABLE IF EXISTS "CardKycApplication" CASCADE;
DROP TABLE IF EXISTS "CardWallet" CASCADE;
