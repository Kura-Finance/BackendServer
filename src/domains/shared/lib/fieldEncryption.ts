/**
 * 欄位層級加解密工具
 * 用於加密/解密個別資料庫欄位，實現「資料庫中只存加密資料」目標。
 *
 * 階段 1：使用伺服器端 ENCRYPTION_KEY（AES-256-GCM）
 * 階段 2：升級為每位使用者專屬 Data Key（由用戶密碼推導，TEE 持有）
 */

import { EncryptionUtil } from './encryption';

export class FieldEncryption {
  // ─────────────────────────────────────────
  // 數值欄位（Float / Int）
  // ─────────────────────────────────────────

  /** 加密數字欄位（如 balance, holdings, currentPrice） */
  static encryptNumber(value: number): string {
    return EncryptionUtil.encrypt(String(value));
  }

  /** 解密數字欄位，若解密失敗回傳 0 */
  static decryptNumber(encrypted: string): number {
    try {
      const plain = EncryptionUtil.decrypt(encrypted);
      const n = parseFloat(plain);
      return isNaN(n) ? 0 : n;
    } catch {
      return 0;
    }
  }

  /** 加密可選數字欄位 */
  static encryptOptionalNumber(value: number | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    return EncryptionUtil.encrypt(String(value));
  }

  /** 解密可選數字欄位 */
  static decryptOptionalNumber(encrypted: string | null | undefined): number | undefined {
    if (!encrypted) return undefined;
    try {
      const plain = EncryptionUtil.decrypt(encrypted);
      const n = parseFloat(plain);
      return isNaN(n) ? undefined : n;
    } catch {
      return undefined;
    }
  }

  // ─────────────────────────────────────────
  // 字串欄位（商家名稱、金額等）
  // ─────────────────────────────────────────

  /** 加密字串欄位 */
  static encryptString(value: string): string {
    return EncryptionUtil.encrypt(value);
  }

  /** 解密字串欄位 */
  static decryptString(encrypted: string): string {
    try {
      return EncryptionUtil.decrypt(encrypted);
    } catch {
      return '';
    }
  }

  /** 加密可選字串欄位 */
  static encryptOptionalString(value: string | null | undefined): string | null {
    if (!value) return null;
    return EncryptionUtil.encrypt(value);
  }

  /** 解密可選字串欄位 */
  static decryptOptionalString(encrypted: string | null | undefined): string | undefined {
    if (!encrypted) return undefined;
    try {
      return EncryptionUtil.decrypt(encrypted);
    } catch {
      return undefined;
    }
  }
}
