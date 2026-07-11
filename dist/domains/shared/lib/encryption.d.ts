/**
 * 数据加密工具类
 * 用于加密和解密敏感数据（API Key、Secret、Token 等）
 */
export declare class EncryptionUtil {
    private static readonly ALGORITHM;
    private static readonly ENCODING;
    private static readonly AUTH_TAG_LENGTH;
    private static readonly IV_LENGTH;
    /**
     * 初始化加密密钥
     */
    private static getEncryptionKey;
    /**
     * 加密敏感数据
     * @param plaintext 要加密的明文字符串
     * @returns 加密后的字符串（格式：iv:authTag:encryptedData）
     */
    static encrypt(plaintext: string): string;
    /**
     * 解密敏感数据
     * @param encrypted 加密后的字符串（格式：iv:authTag:encryptedData）
     * @returns 解密后的明文字符串
     */
    static decrypt(encrypted: string): string;
    /**
     * 生成随机的加密密钥（用于初始化）
     * 返回 32 字节的密钥作为 64 字符的十六进制字符串
     */
    static generateEncryptionKey(): string;
    /**
     * 验证加密密钥格式是否正确
     */
    static validateEncryptionKey(key: string): boolean;
}
//# sourceMappingURL=encryption.d.ts.map