import crypto from 'crypto';
import { logDebug, logError } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';

/**
 * Server-side encryption for secrets the backend must use
 * (API keys, tokens, etc.) — not user E2EE payloads.
 */
export class EncryptionUtil {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly ENCODING = 'hex';
  private static readonly AUTH_TAG_LENGTH = 16;
  private static readonly IV_LENGTH = 12;

  /** Load ENCRYPTION_KEY (64 hex chars = 32 bytes for AES-256). */
  private static getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    // Key must be a 32-byte hex string (AES-256)
    if (key.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    return Buffer.from(key, 'hex');
  }

  /**
   * Encrypt sensitive data.
   * @param plaintext Plaintext string
   * @returns Encrypted string as `iv:authTag:encryptedData`
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

      // Format: iv:authTag:encryptedData
      const result = `${iv.toString(this.ENCODING)}:${authTag.toString(this.ENCODING)}:${encrypted}`;

      const duration = Date.now() - startTime;
      logDebug('Data encrypted successfully', {
        algorithm: this.ALGORITHM,
        dataLength: plaintext.length,
        duration,
      });

      AuditLogger.logKeyAccess('SUCCESS', 'ENCRYPT', {
        algorithm: this.ALGORITHM,
        dataLength: plaintext.length,
      }, undefined);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError('Encryption failed', error);

      AuditLogger.logKeyAccess('FAILURE', 'ENCRYPT', {
        algorithm: this.ALGORITHM,
        dataLength: plaintext.length,
      }, errorMsg);

      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data.
   * @param encrypted Ciphertext as `iv:authTag:encryptedData`
   * @returns Plaintext string
   */
  static decrypt(encrypted: string): string {
    const startTime = Date.now();
    try {
      const key = this.getEncryptionKey();

      // Parse format: iv:authTag:encryptedData
      const parts = encrypted.split(':');

      // Backward compat: legacy unencrypted values have no colon separators
      if (parts.length !== 3) {
        // Treat as legacy plaintext; return as-is and audit
        logDebug('Legacy unencrypted data detected - returning as-is', {
          dataLength: encrypted.length,
          note: 'Please migrate this data by re-encrypting',
        });

        AuditLogger.logKeyAccess('SUCCESS', 'DECRYPT_UNENCRYPTED_LEGACY', {
          algorithm: 'NONE (legacy unencrypted)',
          dataLength: encrypted.length,
        }, 'Legacy data - not encrypted');

        return encrypted;
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

      AuditLogger.logKeyAccess('SUCCESS', 'DECRYPT', {
        algorithm: this.ALGORITHM,
      }, undefined);

      return decrypted;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError('Decryption failed', error);

      AuditLogger.logKeyAccess('FAILURE', 'DECRYPT', {
        algorithm: this.ALGORITHM,
      }, errorMsg);

      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Generate a random encryption key for setup.
   * Returns a 32-byte key as a 64-char hex string.
   */
  static generateEncryptionKey(): string {
    const key = crypto.randomBytes(32);
    return key.toString('hex');
  }

  /** Validate encryption key format (64 hex chars). */
  static validateEncryptionKey(key: string): boolean {
    if (!key || typeof key !== 'string') {
      return false;
    }
    return key.length === 64 && /^[0-9a-f]{64}$/.test(key);
  }
}
