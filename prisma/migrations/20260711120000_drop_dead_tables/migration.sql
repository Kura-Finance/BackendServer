-- Drop unused tables:
--   Admin            — admin auth was never wired up in application code
--   PlaidRefreshLog  — superseded by ApiOperationLog (plaid_refresh)
--   CardDailySpend   — never written; daily spend now aggregated from CardTransaction

DROP TABLE IF EXISTS "Admin" CASCADE;
DROP TABLE IF EXISTS "PlaidRefreshLog" CASCADE;
DROP TABLE IF EXISTS "CardDailySpend" CASCADE;
