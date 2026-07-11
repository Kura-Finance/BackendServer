-- Require User.email (backfill legacy null rows with UUID-based placeholder before NOT NULL)

UPDATE "User"
SET "email" = "id" || '@placeholder.kura-finance.internal'
WHERE "email" IS NULL;

ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
