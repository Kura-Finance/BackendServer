-- Rename AssetPerformance.totalAssets -> cashFlow
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'AssetPerformance'
      AND column_name = 'totalAssets'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'AssetPerformance'
      AND column_name = 'cashFlow'
  ) THEN
    ALTER TABLE "AssetPerformance"
    RENAME COLUMN "totalAssets" TO "cashFlow";
  END IF;
END $$;
