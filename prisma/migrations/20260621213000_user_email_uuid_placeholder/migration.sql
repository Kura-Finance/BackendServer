-- Normalize legacy privyUserId-based placeholder emails to UUID-based placeholders

UPDATE "User"
SET "email" = "id" || '@placeholder.kura-finance.internal'
WHERE "email" LIKE '%@placeholder.kura-finance.internal'
  AND "email" <> "id" || '@placeholder.kura-finance.internal';
