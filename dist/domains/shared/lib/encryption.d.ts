/**
 * 資料加密工具類別
 * 用於加密與解密敏感資料（API Key、Secret、Token 等）
 */
export declare class EncryptionUtil {
    private static readonly ALGORITHM;
    private static readonly ENCODING;
    private static readonly AUTH_TAG_LENGTH;
    private static readonly IV_LENGTH;
    /**
     * 初始化加密金鑰
     */
    private static getEncryptionKey;
    /**
     * 加密敏感資料
     * @param plaintext 要加密的明文字串
     * @returns 加密後的字串（格式：iv:authTag:encryptedData）
     */
    static encrypt(plaintext: string): string;
    /**
     * 解密敏感資料
     * @param encrypted 加密後的字串（格式：iv:authTag:encryptedData）
     * @returns 解密後的明文字串
     */
    static decrypt(encrypted: string): string;
    /**
     * 生成隨機加密金鑰（用於初始化）
     * 回傳 32 位元組金鑰（以 64 字元十六進位字串表示）
     */
    static generateEncryptionKey(): string;
    /**
     * 驗證加密金鑰格式是否正確
     */
    static validateEncryptionKey(key: string): boolean;
}
//# sourceMappingURL=encryption.d.ts.map