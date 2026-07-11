-- BridgeCustomer.fullName / rawCustomer 移除
-- 原因：兩者皆含 PII（法定姓名、KYC 完整 payload）。
--   - fullName 只需即時轉送 Bridge /kyc_links，無需落地
--   - rawCustomer 為 write-only debug 欄位，從未被讀回
-- 狀態改由 kycStatus / endorsements 表達，降低敏感資料外洩面。
ALTER TABLE "BridgeCustomer" DROP COLUMN IF EXISTS "fullName";
ALTER TABLE "BridgeCustomer" DROP COLUMN IF EXISTS "rawCustomer";
