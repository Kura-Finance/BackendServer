import crypto from 'crypto';
import { logDebug, logError } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';

/**
 * 数据加密工具类
 * 用于加密和解密敏感数据（API Key、Secret、Token 等）
 */

export class EncryptionUtil {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly ENCODING = 'hex';
  private static readonly AUTH_TAG_LENGTH = 16;
  private static readonly IV_LENGTH = 12;

  /**
   * 初始化加密密钥
   */
  private static getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    // Key 应该是 32 字节的十六进制字符串（用于 AES-256）
    if (key.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    return Buffer.from(key, 'hex');
  }

  /**
   * 加密敏感数据
   * @param plaintext 要加密的明文字符串
   * @returns 加密后的字符串（格式：iv:authTag:encryptedData）
   */
  static encrypt(plaintext: string): string {
    const startTime = Date.now();
    try {
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(this.IV_LENGTH);

      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
      const encryptedBuffer = cipher.update(plaintext, 'utf8', this.ENCODING);
      const finalBuffer = cipher.final(this.ENCODING);
      const encrypted = encryptedBuffer + finalBuffer;

      const authTag = cipher.getAuthTag();

      // 格式：iv:authTag:encryptedData
      const result = `${iv.toString(this.ENCODING)}:${authTag.toString(this.ENCODING)}:${encrypted}`;

      const duration = Date.now() - startTime;
      logDebug('Data encrypted successfully', {
        algorithm: this.ALGORITHM,
        dataLength: plaintext.length,
        duration,
      });

      // 记录审计日志（成功）
      AuditLogger.logKeyAccess('SUCCESS', 'ENCRYPT', {
        algorithm: this.ALGORITHM,
        dataLength: plaintext.length,
      }, undefined);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError('Encryption failed', error);
      
      // 记录审计日志（失败）
      AuditLogger.logKeyAccess('FAILURE', 'ENCRYPT', {
        algorithm: this.ALGORITHM,
        dataLength: plaintext.length,
      }, errorMsg);
      
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * 解密敏感数据
   * @param encrypted 加密后的字符串（格式：iv:authTag:encryptedData）
   * @returns 解密后的明文字符串
   */
  static decrypt(encrypted: string): string {
    const startTime = Date.now();
    try {
      const key = this.getEncryptionKey();

      // 解析格式：iv:authTag:encryptedData
      const parts = encrypted.split(':');
      
      // 向后兼容：检查是否是旧的未加密数据（没有冒号分隔符）
      if (parts.length !== 3) {
        // 假设这是未加密的遗留数据，返回原始值
        // 并记录警告日志进行审计
        logDebug('Legacy unencrypted data detected - returning as-is', {
          dataLength: encrypted.length,
          note: 'Please migrate this data by re-encrypting',
        });

        AuditLogger.logKeyAccess('SUCCESS', 'DECRYPT_UNENCRYPTED_LEGACY', {
          algorithm: 'NONE (legacy unencrypted)',
          dataLength: encrypted.length,
        }, 'Legacy data - not encrypted');

        return encrypted; // 返回原始值
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

      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const decryptedBuffer = decipher.update(encryptedData, this.ENCODING, 'utf8');
      const finalBuffer = decipher.final('utf8');
      const decrypted = decryptedBuffer + finalBuffer;

      const duration = Date.now() - startTime;
      logDebug('Data decrypted successfully', {
        algorithm: this.ALGORITHM,
        duration,
      });

      // 记录审计日志（成功）
      AuditLogger.logKeyAccess('SUCCESS', 'DECRYPT', {
        algorithm: this.ALGORITHM,
      }, undefined);

      return decrypted;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError('Decryption failed', error);
      
      // 记录审计日志（失败）
      AuditLogger.logKeyAccess('FAILURE', 'DECRYPT', {
        algorithm: this.ALGORITHM,
      }, errorMsg);
      
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * 生成随机的加密密钥（用于初始化）
   * 返回 32 字节的密钥作为 64 字符的十六进制字符串
   */
  static generateEncryptionKey(): string {
    const key = crypto.randomBytes(32);
    return key.toString('hex');
  }

  /**
   * 验证加密密钥格式是否正确
   */
  static validateEncryptionKey(key: string): boolean {
    if (!key || typeof key !== 'string') {
      return false;
    }
    return key.length === 64 && /^[0-9a-f]{64}$/.test(key);
  }
}
