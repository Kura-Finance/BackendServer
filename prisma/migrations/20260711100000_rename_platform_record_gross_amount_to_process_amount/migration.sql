-- Rename PlatformRecord.grossAmount -> processAmount
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'PlatformRecord'
      AND column_name = 'grossAmount'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'PlatformRecord'
      AND column_name = 'processAmount'
  ) THEN
    ALTER TABLE "PlatformRecord"
    RENAME COLUMN "grossAmount" TO "processAmount";
  END IF;
END $$;
