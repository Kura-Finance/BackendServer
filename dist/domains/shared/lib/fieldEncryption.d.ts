/**
 * 欄位層級加解密工具
 * 用於加密/解密個別資料庫欄位，實現「資料庫中只存加密資料」目標。
 *
 * 階段 1：使用伺服器端 ENCRYPTION_KEY（AES-256-GCM）
 * 階段 2：升級為每位使用者專屬 Data Key（由用戶密碼推導，TEE 持有）
 */
export declare class FieldEncryption {
    /** 加密數字欄位（如 balance, holdings, currentPrice） */
    static encryptNumber(value: number): string;
    /** 解密數字欄位，若解密失敗回傳 0 */
    static decryptNumber(encrypted: string): number;
    /** 加密可選數字欄位 */
    static encryptOptionalNumber(value: number | null | undefined): string | null;
    /** 解密可選數字欄位 */
    static decryptOptionalNumber(encrypted: string | null | undefined): number | undefined;
    /** 加密字串欄位 */
    static encryptString(value: string): string;
    /** 解密字串欄位 */
    static decryptString(encrypted: string): string;
    /** 加密可選字串欄位 */
    static encryptOptionalString(value: string | null | undefined): string | null;
    /** 解密可選字串欄位 */
    static decryptOptionalString(encrypted: string | null | undefined): string | undefined;
}
//# sourceMappingURL=fieldEncryption.d.ts.map