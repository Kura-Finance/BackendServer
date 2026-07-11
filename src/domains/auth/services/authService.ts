import * as jwt from 'jsonwebtoken';
import { prisma } from '../../shared/lib/prisma';
import { logAuthEvent, logError, logDatabaseOperation, logBusinessEvent, logDebug } from '../../logger';
import { UserProfile, UpdateProfilePayload, PlaidCacheInfo } from '../models/types';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { EmailService } from '../../email';
import { getCacheStats } from '../../plaid/lib/plaidCacheUtil';

type SRPAuthPayload = {
  srpSalt: string;
  srpVerifier: string;
  encryptedDataKey: string;
  kekSalt: string;
};

/**
 * 註冊流程已整合為郵件驗證模式
 * 使用資料庫儲存驗證碼，而不是記憶體快取
 */

/**
 * 認證服務 - 業務邏輯層
 */

export class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'secret';
  private static readonly VERIFICATION_CODE_EXPIRY = 10 * 60 * 1000; // 10 分鐘

  private static normalizeHex(value: string): string {
    return value.trim().toLowerCase();
  }

  private static isHexString(value: string): boolean {
    const normalized = this.normalizeHex(value);
    return /^[a-f0-9]+$/.test(normalized) && normalized.length % 2 === 0;
  }

  private static assertRequiredSrpPayload(payload: SRPAuthPayload, missingMessage: string): void {
    if (!payload.srpSalt || !payload.srpVerifier || !payload.encryptedDataKey || !payload.kekSalt) {
      throw new Error(missingMessage);
    }
  }

  private static assertValidSrpPayload(payload: SRPAuthPayload): void {
    if (
      !this.isHexString(payload.srpSalt) ||
      !this.isHexString(payload.srpVerifier) ||
      !this.isHexString(payload.encryptedDataKey) ||
      !this.isHexString(payload.kekSalt)
    ) {
      throw new Error('Invalid SRP payload format');
    }
  }

  private static normalizeSrpPayload(payload: SRPAuthPayload): SRPAuthPayload {
    return {
      srpSalt: this.normalizeHex(payload.srpSalt),
      srpVerifier: this.normalizeHex(payload.srpVerifier),
      encryptedDataKey: this.normalizeHex(payload.encryptedDataKey),
      kekSalt: this.normalizeHex(payload.kekSalt),
    };
  }

  private static buildSrpAuthUpdateData(payload: SRPAuthPayload) {
    const normalizedPayload = this.normalizeSrpPayload(payload);
    return {
      srpSalt: normalizedPayload.srpSalt,
      srpVerifier: normalizedPayload.srpVerifier,
      encryptedDataKey: normalizedPayload.encryptedDataKey,
      kekSalt: normalizedPayload.kekSalt,
    };
  }

  private static async updateUserSrpAuthById(userId: string, payload: SRPAuthPayload): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: this.buildSrpAuthUpdateData(payload),
    });
  }

  /**
   * ============================================
   * 統一驗證碼管理系統
   * ============================================
   */

  /**
   * 發送驗證碼 (通用方法)
   * @param email 目標郵箱
   * @param type 驗證碼類型: 'register' | 'password-reset' | 'email-change'
   * @param userId 使用者 ID (可選，註冊時不需要)
   * @param metadata 額外資料 (例如：新郵箱、其他必要資訊)
   */
  static async sendVerificationCode(
    email: string,
    type: 'register' | 'password-reset' | 'email-change',
    userId?: string,
    metadata?: Record<string, unknown>
  ): Promise<{ expiresIn: number }> {
    logDebug('Sending verification code', { email, type, userId });

    if (!email) {
      throw new Error('Email is required');
    }

    if (type === 'register') {
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, srpVerifier: true },
      });

      // 已完成 SRP 註冊的帳號，不允許再走註冊流程重發驗證碼
      if (existingUser?.srpVerifier) {
        throw new Error('Email is already registered. Please sign in.');
      }
    }

    // 生成 6 位驗證碼
    const code = Math.random().toString().slice(2, 8).padStart(6, '0');
    const expiresAt = new Date(Date.now() + this.VERIFICATION_CODE_EXPIRY);

    try {
      // 刪除同類型的舊驗證碼
      const deleteStartTime = Date.now();
      await prisma.verificationCode.deleteMany({
        where: {
          email,
          type,
          // 如果是已登入使用者，保持 userId 一致
          ...(userId && { userId }),
        },
      });
      logDatabaseOperation('DELETE', 'verification_codes', Date.now() - deleteStartTime, true);

      // 建立新驗證碼
      const createStartTime = Date.now();
      await prisma.verificationCode.create({
        data: {
          email,
          code,
          type,
          userId: userId || null,
          metadata: (metadata || {}) as any,
          expiresAt,
        },
      });
      logDatabaseOperation('CREATE', 'verification_codes', Date.now() - createStartTime, true);

      logBusinessEvent('verification_code_sent', userId, { email, type });

      // 發送郵件
      const emailSent = await EmailService.sendVerificationEmail(
        email,
        code,
        email.split('@')[0]
      );

      if (!emailSent) {
        logError('Failed to send verification email', new Error('Email service failed'), { email, type });
        throw new Error('Unable to send verification code. Please try again later.');
      }

      logAuthEvent('verification_code_sent', userId, { email, type });

      return { expiresIn: this.VERIFICATION_CODE_EXPIRY };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unable to send')) {
        throw error;
      }
      logError('Failed to send verification code', error, { email, type });
      throw new Error('Failed to send verification code. Please try again later.');
    }
  }

  /**
   * 驗證碼驗證 (通用方法)
   * @param email 目標郵箱
   * @param code 驗證碼
   * @param type 驗證碼類型
   * @returns { valid: boolean; metadata?: unknown }
   */
  static async verifyCode(
    email: string,
    code: string,
    type: 'register' | 'password-reset' | 'email-change'
  ): Promise<{ valid: boolean; metadata?: unknown }> {
    logDebug('Verifying code', { email, type });

    if (!email || !code) {
      throw new Error('Email and verification code are required');
    }

    try {
      const startTime = Date.now();
      const verificationCode = await prisma.verificationCode.findFirst({
        where: {
          email,
          code,
          type,
        },
      });
      logDatabaseOperation('SELECT', 'verification_codes', Date.now() - startTime, true);

      if (!verificationCode) {
        logAuthEvent('failed_verification', undefined, { email, type, reason: 'invalid_code' });
        throw new Error('Invalid verification code');
      }

      // 檢查過期
      if (new Date() > verificationCode.expiresAt) {
        logAuthEvent('failed_verification', verificationCode.userId ?? undefined, { email, type, reason: 'expired' });
        throw new Error('Verification code has expired. Please request a new one.');
      }

      // 刪除已使用的驗證碼
      const deleteStartTime = Date.now();
      await prisma.verificationCode.delete({
        where: { id: verificationCode.id },
      });
      logDatabaseOperation('DELETE', 'verification_codes', Date.now() - deleteStartTime, true);

      logAuthEvent('verification_success', verificationCode.userId ?? undefined, { email, type });
      logBusinessEvent('verification_code_verified', verificationCode.userId ?? undefined, { type });

      return {
        valid: true,
        metadata: verificationCode.metadata,
      };
    } catch (error) {
      if (error instanceof Error && (error.message.includes('Invalid') || error.message.includes('expired'))) {
        throw error;
      }
      logError('Failed to verify code', error, { email, type });
      throw new Error('Verification failed. Please try again later.');
    }
  }

  /**
   * 取得使用者資料
   */
  static async buildUserProfile(userId: string): Promise<UserProfile | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        tier: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: (user.name || user.email.split('@')[0]) as string,
      avatarUrl:
        user.avatarUrl ||
        `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(user.email)}&backgroundColor=e2e8f0`,
      membershipLabel: `${user.tier || 'Basic'} Member`,
    };
  }

  /**
   * 取得當前使用者資訊
   */
  static async getCurrentUser(userId: string): Promise<UserProfile> {
    const startTime = Date.now();
    const profile = await this.buildUserProfile(userId);
    logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

    if (!profile) {
      logError('User profile not found', new Error('User not found'), { userId });
      throw new Error('User not found');
    }

    return profile;
  }

  /**
   * 取得當前使用者資訊（包含 Plaid 快取統計）
   */
  static async getCurrentUserWithPlaidCache(userId: string): Promise<UserProfile> {
    const profile = await this.getCurrentUser(userId);

    try {
      // 取得 Plaid 快取統計資料
      const cacheStats = await getCacheStats(userId);

      const plaidCacheInfo: PlaidCacheInfo = {
        accounts: cacheStats.accounts,
        transactions: cacheStats.transactions,
        investmentAccounts: cacheStats.investmentAccounts,
        investments: cacheStats.investments,
        lastSynced: cacheStats.lastSynced,
        accountsSynced: cacheStats.accountsSynced,
        transactionsSynced: cacheStats.transactionsSynced,
        investmentsSynced: cacheStats.investmentsSynced,
      };

      return {
        ...profile,
        plaidCache: plaidCacheInfo,
      };
    } catch (error) {
      logDebug('Failed to fetch Plaid cache stats, returning profile without cache info', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // 若取得快取統計失敗，仍回傳使用者資料（快取資訊為可選）
      return profile;
    }
  }

  /**
   * 更新使用者資料
   */
  static async updateUserProfile(userId: string, payload: UpdateProfilePayload): Promise<UserProfile> {
    const updateData: { name?: string | null; avatarUrl?: string | null } = {};

    if (payload.displayName !== undefined) {
      updateData.name = payload.displayName;
    }

    if (payload.avatarUrl !== undefined) {
      updateData.avatarUrl = payload.avatarUrl;
    }

    if (payload.avatarBase64 !== undefined) {
      updateData.avatarUrl = payload.avatarBase64;  // 將 Base64 直接儲存在 avatarUrl 欄位
    }

    logDebug('Updating user profile', { userId, changes: Object.keys(updateData) });

    const startTime = Date.now();
    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
    logDatabaseOperation('UPDATE', 'users', Date.now() - startTime, true);

    const profile = await this.buildUserProfile(userId);

    if (!profile) {
      throw new Error('Failed to update user profile');
    }

    logBusinessEvent('profile_updated', userId, { displayName: payload.displayName, hasAvatar: !!payload.avatarUrl });

    return profile;
  }

  /**
   * 請求密碼重置 (整合郵件驗證碼模式)
   * 發送 6 位驗證碼到郵箱，而不是回傳 token
   */
  static async requestPasswordReset(email: string): Promise<{ expiresIn: number }> {
    logDebug('Processing password reset request', { email });

    if (!email) {
      throw new Error('Email is required');
    }

    try {
      const startTime = Date.now();
      const user = await prisma.user.findUnique({ where: { email } });
      logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

      if (!user) {
        // 不透露使用者是否存在，回傳通用訊息
        logAuthEvent('failed_password_reset_request', undefined, { email, reason: 'user_not_found' });
        // 回傳成功以保護使用者隱私
        return { expiresIn: 10 * 60 };
      }

      // 刪除該使用者的舊重置碼
      const deleteStartTime = Date.now();
      await prisma.verificationCode.deleteMany({
        where: {
          email,
          type: 'password-reset',
        },
      });
      logDatabaseOperation('DELETE', 'verification_codes', Date.now() - deleteStartTime, true);

      // 生成 6 位數字驗證碼
      const resetCode = Math.random().toString().slice(2, 8).padStart(6, '0');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 分鐘過期

      const createStartTime = Date.now();
      await prisma.verificationCode.create({
        data: {
          email,
          code: resetCode,
          type: 'password-reset',
          userId: user.id,
          expiresAt,
          metadata: {},
        },
      });
      logDatabaseOperation('CREATE', 'verification_codes', Date.now() - createStartTime, true);

      logAuthEvent('password_reset_requested', user.id, { email });
      logBusinessEvent('password_reset_token_generated', user.id, { email });

      // 發送密碼重置郵件
      const emailSent = await EmailService.sendPasswordResetEmail(email, resetCode, user.name || undefined);
      if (!emailSent) {
        logError('Failed to send password reset email', new Error('Email service failed'), { email });
        throw new Error('Unable to send reset code. Please try again later.');
      }

      logAuthEvent('password_reset_code_sent', user.id, { email });

      return { expiresIn: 10 * 60 }; // 秒數
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        logAuthEvent('failed_password_reset_request', undefined, { email, reason: 'database_error' });
        throw new Error('Server error: unable to send reset code');
      }
      throw error;
    }
  }

  /**
   * 驗證密碼重置碼並重置密碼 (整合郵件驗證碼模式)
   */
  static async resetPassword(
    email: string,
    resetCode: string,
    srpSalt: string,
    srpVerifier: string,
    encryptedDataKey: string,
    kekSalt: string,
    preserveData = false
  ): Promise<{ success: boolean; message: string }> {
    logDebug('Processing password reset (SRP)', { email, preserveData });

    const srpPayload: SRPAuthPayload = this.normalizeSrpPayload({
      srpSalt,
      srpVerifier,
      encryptedDataKey,
      kekSalt,
    });

    if (!email || !resetCode) {
      throw new Error('Missing required parameters');
    }
    this.assertRequiredSrpPayload(srpPayload, 'Missing required parameters');

    if (resetCode.length !== 6 || !/^\d{6}$/.test(resetCode)) {
      throw new Error('Invalid verification code format');
    }
    this.assertValidSrpPayload(srpPayload);

    try {
      // 驗證重置碼
      const { valid } = await this.verifyCode(email, resetCode, 'password-reset');
      
      if (!valid) {
        throw new Error('Reset code is invalid or expired');
      }

      // 查詢使用者
      const startTime = Date.now();
      const user = await prisma.user.findUnique({ where: { email } });
      logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

      if (!user) {
        logAuthEvent('failed_password_reset', undefined, { email, reason: 'user_not_found' });
        throw new Error('User not found');
      }

      // 重置碼有效，更新 SRP 認證資訊與新的資料金鑰（Data Key）
      const updateStartTime = Date.now();
      await this.updateUserSrpAuthById(user.id, srpPayload);
      logDatabaseOperation('UPDATE', 'users', Date.now() - updateStartTime, true);

      logAuthEvent('password_reset_success', user.id, { email, preserveData });
      logBusinessEvent('user_password_reset_srp', user.id, { email, preserveData });

      return {
        success: true,
        message: preserveData
          ? 'Password changed successfully and encrypted data key preserved'
          : 'Password reset successfully',
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        logAuthEvent('failed_password_reset', undefined, { email, reason: 'database_error' });
        throw new Error('Server error: unable to reset password');
      }
      throw error;
    }
  }

  /**
   * 刪除使用者帳戶
   */
  static async deleteAccount(userId: string): Promise<{ success: boolean; message: string }> {
    logDebug('Processing account deletion', { userId });

    if (!userId) {
      throw new Error('Missing required parameters');
    }

    // 取得使用者資訊
    const startTime = Date.now();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

    if (!user) {
      logAuthEvent('failed_register', undefined, { userId, reason: 'user_not_found' });
      throw new Error('User not found');
    }

    // 刪除使用者及其相關資料
    const deleteStartTime = Date.now();
    await prisma.user.delete({
      where: { id: userId },
    });
    logDatabaseOperation('DELETE', 'users', Date.now() - deleteStartTime, true);

    logAuthEvent('register', userId, { email: user.email, action: 'delete_account' });
    logBusinessEvent('user_account_deleted', userId, { email: user.email });

    return {
      success: true,
      message: 'Account deleted successfully',
    };
  }

  /**
   * 請求修改郵箱 - 發送驗證碼到新郵箱
   */
  static async requestEmailChange(userId: string, newEmail: string): Promise<{ expiresIn: number }> {
    logDebug('Processing email change request', { userId, newEmail });

    if (!userId || !newEmail) {
      throw new Error('Missing required parameters');
    }

    // 驗證新郵箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      throw new Error('Invalid email format');
    }

    // 檢查新郵箱是否已被使用
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (existingUser) {
      throw new Error('Email is already registered');
    }

    // 使用統一的驗證碼系統
    return this.sendVerificationCode(newEmail, 'email-change', userId, { newEmail });
  }

  /**
   * 確認修改郵箱 - 驗證碼驗證成功則修改郵箱
   */
  static async confirmEmailChange(userId: string, newEmail: string, code: string): Promise<{ success: boolean; message: string; user: UserProfile }> {
    logDebug('Processing email change confirmation', { userId });

    if (!userId || !newEmail || !code) {
      throw new Error('Missing required parameters');
    }

    // 驗證碼驗證
    const verification = await this.verifyCode(newEmail, code, 'email-change');

    if (!verification.valid) {
      throw new Error('Verification failed');
    }

    // 取得當前使用者資訊
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // 更新郵箱
    const updateStartTime = Date.now();
    await prisma.user.update({
      where: { id: userId },
      data: {
        email: newEmail,
      },
    });
    logDatabaseOperation('UPDATE', 'users', Date.now() - updateStartTime, true);

    logAuthEvent('email_changed', userId, { oldEmail: user.email, newEmail });
    logBusinessEvent('email_changed', userId, { newEmail });

    // 取得更新後的使用者資料
    const profile = await this.buildUserProfile(userId);
    if (!profile) {
      throw new Error('Unable to fetch updated user profile');
    }

    return {
      success: true,
      message: 'Email updated successfully',
      user: profile,
    };
  }

  /**
   * 驗證郵箱驗證碼並註冊 (第二步)
   */
  static async verifyEmailAndRegister(
    email: string,
    verificationCode: string,
    srpData: SRPAuthPayload
  ): Promise<{ token: string; user: UserProfile }> {
    logDebug('Verifying email and completing registration', { email });

    // 驗證驗證碼格式
    if (!verificationCode || verificationCode.length !== 6) {
      throw new Error('Invalid verification code format');
    }

    const normalizedSrpData = this.normalizeSrpPayload(srpData);
    this.assertRequiredSrpPayload(normalizedSrpData, 'Missing SRP registration payload');
    this.assertValidSrpPayload(normalizedSrpData);

    try {
      // 使用新的統一驗證碼系統驗證
      const verification = await this.verifyCode(email, verificationCode, 'register');

      if (!verification.valid) {
        throw new Error('Verification failed');
      }

      // 取得使用者
      const startTime = Date.now();
      const user = await prisma.user.findUnique({ where: { email } });
      logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

      let registeredUser;
      if (!user) {
        // 建立新使用者（首次註冊）
        // 前端必須本地生成 DEK，並只上傳用 KEK 包裹後的 encryptedDataKey。
        const createStartTime = Date.now();
        registeredUser = await prisma.user.create({
          data: {
            email,
            ...this.buildSrpAuthUpdateData(normalizedSrpData),
            emailVerified: true,
          },
        });
        logDatabaseOperation('CREATE', 'users', Date.now() - createStartTime, true);
        logAuthEvent('register', registeredUser.id, { email });
      } else {
        // 防呆：已完成 SRP 註冊的帳號不可被註冊流程覆蓋。
        if (user.srpVerifier) {
          throw new Error('Registration already completed. Please sign in.');
        }

        // 更新既有使用者（郵箱已存在但尚未完成 SRP 註冊）
        const updateStartTime = Date.now();
        registeredUser = await prisma.user.update({
          where: { id: user.id },
          data: {
            ...this.buildSrpAuthUpdateData(normalizedSrpData),
            emailVerified: true,
          },
        });
        logDatabaseOperation('UPDATE', 'users', Date.now() - updateStartTime, true);
      }

      // 生成 JWT 權杖
      const token = jwt.sign({ userId: registeredUser.id }, this.JWT_SECRET, { expiresIn: '7d' });
      const userProfile = await this.buildUserProfile(registeredUser.id);

      if (!userProfile) {
        throw new Error('Unable to build user profile');
      }

      logAuthEvent('email_verified', registeredUser.id, { email });
      logBusinessEvent('user_email_verified', registeredUser.id, { email });

      return { token, user: userProfile };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new Error('Server error: unable to complete verification');
      }
      throw error;
    }
  }

}
