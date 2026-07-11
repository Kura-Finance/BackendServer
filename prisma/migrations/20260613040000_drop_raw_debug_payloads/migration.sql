-- 移除所有 write-only 的 raw* debug payload 欄位
-- 原因：這些欄位儲存第三方回傳的完整 payload（含金額、銀行 routing、寄款人姓名、
-- 下單細節等敏感資訊），僅供 debug，從未被程式讀回。移除以降低資料外洩面。
ALTER TABLE "BridgeExternalAccount"     DROP COLUMN IF EXISTS "rawAccount";
ALTER TABLE "BridgeVirtualAccount"      DROP COLUMN IF EXISTS "rawAccount";
ALTER TABLE "BridgeVirtualAccountEvent" DROP COLUMN IF EXISTS "rawEvent";
ALTER TABLE "BridgeTransfer"            DROP COLUMN IF EXISTS "rawTransfer";
ALTER TABLE "DinariOrder"               DROP COLUMN IF EXISTS "rawOrderRequest";
ALTER TABLE "DinariOrder"               DROP COLUMN IF EXISTS "rawOrder";
