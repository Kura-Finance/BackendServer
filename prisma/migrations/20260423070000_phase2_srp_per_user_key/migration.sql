-- Phase 2: SRP + Per-user Data Key fields
-- 新增 SRP 驗證欄位和 per-user Data Key 欄位到 User 表

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "srpSalt"          TEXT,
  ADD COLUMN IF NOT EXISTS "srpVerifier"      TEXT,
  ADD COLUMN IF NOT EXISTS "encryptedDataKey" TEXT,
  ADD COLUMN IF NOT EXISTS "kekSalt"          TEXT;
