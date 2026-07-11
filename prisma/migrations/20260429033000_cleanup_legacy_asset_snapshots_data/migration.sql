-- Remove legacy per-asset snapshot rows, keep only composite snapshots
DELETE FROM "AssetSnapshot"
WHERE "type" <> 'composite';

-- Re-sync AssetPerformance from latest composite snapshot
WITH latest_composite AS (
  SELECT DISTINCT ON ("userId")
    "userId",
    "value",
    "recordedAt"
  FROM "AssetSnapshot"
  WHERE "type" = 'composite'
  ORDER BY "userId", "recordedAt" DESC
)
UPDATE "AssetPerformance" ap
SET
  "totalAssets" = lc."value",
  "lastRecordedTime" = lc."recordedAt",
  "updatedAt" = NOW()
FROM latest_composite lc
WHERE ap."userId" = lc."userId";
