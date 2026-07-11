"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptionUtil = void 0;
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../../logger");
const auditLog_1 = require("../../logger/auditLog");
/**
 * 資料加密工具類別
 * 用於加密與解密敏感資料（API Key、Secret、Token 等）
 */
class EncryptionUtil {
    static ALGORITHM = 'aes-256-gcm';
    static ENCODING = 'hex';
    static AUTH_TAG_LENGTH = 16;
    static IV_LENGTH = 12;
    /**
     * 初始化加密金鑰
     */
    static getEncryptionKey() {
        const key = process.env.ENCRYPTION_KEY;
        if (!key) {
            throw new Error('ENCRYPTION_KEY environment variable is not set');
        }
        // Key 應為 32 位元組的十六進位字串（用於 AES-256）
        if (key.length !== 64) {
            throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
        }
        return Buffer.from(key, 'hex');
    }
    /**
     * 加密敏感資料
     * @param plaintext 要加密的明文字串
     * @returns 加密後的字串（格式：iv:authTag:encryptedData）
     */
    static encrypt(plaintext) {
        const startTime = Date.now();
        try {
            const key = this.getEncryptionKey();
            const iv = crypto_1.default.randomBytes(this.IV_LENGTH);
            const cipher = crypto_1.default.createCipheriv(this.ALGORITHM, key, iv);
            const encryptedBuffer = cipher.update(plaintext, 'utf8', this.ENCODING);
            const finalBuffer = cipher.final(this.ENCODING);
            const encrypted = encryptedBuffer + finalBuffer;
            const authTag = cipher.getAuthTag();
            // 格式：iv:authTag:encryptedData
            const result = `${iv.toString(this.ENCODING)}:${authTag.toString(this.ENCODING)}:${encrypted}`;
            const duration = Date.now() - startTime;
            (0, logger_1.logDebug)('Data encrypted successfully', {
                algorithm: this.ALGORITHM,
                dataLength: plaintext.length,
                duration,
            });
            // 記錄稽核日誌（成功）
            auditLog_1.AuditLogger.logKeyAccess('SUCCESS', 'ENCRYPT', {
                algorithm: this.ALGORITHM,
                dataLength: plaintext.length,
            }, undefined);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            (0, logger_1.logError)('Encryption failed', error);
            // 記錄稽核日誌（失敗）
            auditLog_1.AuditLogger.logKeyAccess('FAILURE', 'ENCRYPT', {
                algorithm: this.ALGORITHM,
                dataLength: plaintext.length,
            }, errorMsg);
            throw new Error('Failed to encrypt data');
        }
    }
    /**
     * 解密敏感資料
     * @param encrypted 加密後的字串（格式：iv:authTag:encryptedData）
     * @returns 解密後的明文字串
     */
    static decrypt(encrypted) {
        const startTime = Date.now();
        try {
            const key = this.getEncryptionKey();
            // 解析格式：iv:authTag:encryptedData
            const parts = encrypted.split(':');
            // 向後相容：檢查是否為舊版未加密資料（沒有冒號分隔符）
            if (parts.length !== 3) {
                // 假設這是未加密的舊資料，回傳原始值
                // 並記錄警告日誌以利稽核
                (0, logger_1.logDebug)('Legacy unencrypted data detected - returning as-is', {
                    dataLength: encrypted.length,
                    note: 'Please migrate this data by re-encrypting',
                });
                auditLog_1.AuditLogger.logKeyAccess('SUCCESS', 'DECRYPT_UNENCRYPTED_LEGACY', {
                    algorithm: 'NONE (legacy unencrypted)',
                    dataLength: encrypted.length,
                }, 'Legacy data - not encrypted');
                return encrypted; // 回傳原始值
            }
            const ivHex = parts[0];
            const authTagHex = parts[1];
            const encryptedData = parts[2];
            if (!ivHex || !authTagHex || !encryptedData) {
                throw new Error('Invalid encrypted data format - missing parts');
            }
            const iv = Buffer.from(ivHex, this.ENCODING);
            const authTag = Buffer.from(authTagHex, this.ENCODING);
            if (iv.length !== this.IV_LENGTH) {
                throw new Error('Invalid IV length');
            }
            if (authTag.length !== this.AUTH_TAG_LENGTH) {
                throw new Error('Invalid auth tag length');
            }
            const decipher = crypto_1.default.createDecipheriv(this.ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);
            const decryptedBuffer = decipher.update(encryptedData, this.ENCODING, 'utf8');
            const finalBuffer = decipher.final('utf8');
            const decrypted = decryptedBuffer + finalBuffer;
            const duration = Date.now() - startTime;
            (0, logger_1.logDebug)('Data decrypted successfully', {
                algorithm: this.ALGORITHM,
                duration,
            });
            // 記錄稽核日誌（成功）
            auditLog_1.AuditLogger.logKeyAccess('SUCCESS', 'DECRYPT', {
                algorithm: this.ALGORITHM,
            }, undefined);
            return decrypted;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            (0, logger_1.logError)('Decryption failed', error);
            // 記錄稽核日誌（失敗）
            auditLog_1.AuditLogger.logKeyAccess('FAILURE', 'DECRYPT', {
                algorithm: this.ALGORITHM,
            }, errorMsg);
            throw new Error('Failed to decrypt data');
        }
    }
    /**
     * 生成隨機加密金鑰（用於初始化）
     * 回傳 32 位元組金鑰（以 64 字元十六進位字串表示）
     */
    static generateEncryptionKey() {
        const key = crypto_1.default.randomBytes(32);
        return key.toString('hex');
    }
    /**
     * 驗證加密金鑰格式是否正確
     */
    static validateEncryptionKey(key) {
        if (!key || typeof key !== 'string') {
            return false;
        }
        return key.length === 64 && /^[0-9a-f]{64}$/.test(key);
    }
}
exports.EncryptionUtil = EncryptionUtil;
//# sourceMappingURL=encryption.js.map