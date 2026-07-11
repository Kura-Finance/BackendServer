-- DinariEntity.rawKyc 移除
-- 原因：KYC 原始 payload 含 PII（姓名/地址/證件/SSN 等），後端流程不需要，
-- 僅保留 kycStatus 做 gating，降低敏感資料外洩面。此欄位從未被寫入。
ALTER TABLE "DinariEntity" DROP COLUMN IF EXISTS "rawKyc";
