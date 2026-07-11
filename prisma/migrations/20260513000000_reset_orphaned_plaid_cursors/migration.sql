-- ======================================================================
-- Reset orphaned Plaid transaction cursors
--
-- Background
-- ----------
-- A bug introduced when `saveFinanceSnapshotToCache` was wrapped in a
-- `prisma.$transaction` caused `upsertTransactionsCache` to run concurrent
-- upserts inside the transaction (a known Prisma anti-pattern).  The
-- concurrent writes deadlocked / hit the 5 s default timeout and the
-- transaction was rolled back — but `transactionsCursor` had already been
-- written *outside* the transaction in the same fetch step.
--
-- End result: cursor advanced, cache empty.  Subsequent calls to
-- `transactionsSync` only return the *next* delta (nothing), so the
-- affected users never see any transactions at all.
--
-- The code fix (sequential upserts + cursor write moved *inside* the
-- transaction, 60 s timeout) is already deployed.  This migration
-- resets the orphaned cursors so the next `finance-snapshot` call
-- triggers a full re-fetch from the beginning of Plaid history.
--
-- Safety
-- ------
-- - Idempotent: running it twice leaves the DB in the same state.
-- - Targets only PlaidItems that have NO cached transaction rows.
--   Items with ≥ 1 existing row are untouched (their cursor is valid).
-- - Does NOT delete any user data; only clears the cursor pointer.
-- ======================================================================

UPDATE "PlaidItem" pi
SET    "transactionsCursor" = NULL
WHERE  pi."transactionsCursor" IS NOT NULL
  AND  NOT EXISTS (
         SELECT 1
         FROM   "PlaidTransactionCache" ptc
         WHERE  ptc."userId"      = pi."userId"
           AND  ptc."plaidItemId" = pi."id"
       );
