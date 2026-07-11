import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../../shared/lib/prisma';
import { logAuthEvent, logError, logDatabaseOperation, logBusinessEvent, logDebug } from '../../logger';
import { UserProfile, UpdateProfilePayload, PlaidCacheInfo } from '../models/types';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { EmailService } from '../../email';
import { getCacheStats } from '../../plaid/lib/plaidCacheUtil';

/**
 * 注册流程已整合为邮件验证模式
 * 使用数据库存储验证码，而不是内存缓存
 */

/**
 * Auth Service - Business Logic Layer
 */

export class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'secret';
  private static readonly REGISTER_TOKEN_EXPIRY = 5 * 60 * 1000; // 5分钟
  private static readonly VERIFICATION_CODE_EXPIRY = 10 * 60 * 1000; // 10分钟

  /**
   * ============================================
   * 統一驗證碼管理系統
   * ============================================
   */

  /**
   * 發送驗證碼 (通用方法)
   * @param email 目標郵箱
   * @param type 驗證碼類型: 'register' | 'password-reset' | 'email-change'
   * @param userId 用戶ID (可選，註冊時不需要)
   * @param metadata 額外數據 (例如: 新郵箱、其他必要信息)
   */
  static async sendVerificationCode(
    email: string,
    type: 'register' | 'password-reset' | 'email-change',
    userId?: string,
    metadata?: Record<string, unknown>
  ): Promise<{ expiresIn: number }> {
    logDebug('Sending verification code', { email, type, userId });

    if (!email) {
      throw new Error('郵箱不能為空');
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
          // 如果是已登入用戶，保持 userId 一致
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
        throw new Error('無法發送驗證碼，請稍後重試');
      }

      logAuthEvent('verification_code_sent', userId, { email, type });

      return { expiresIn: this.VERIFICATION_CODE_EXPIRY };
    } catch (error) {
      if (error instanceof Error && error.message.includes('無法發送')) {
        throw error;
      }
      logError('Failed to send verification code', error, { email, type });
      throw new Error('驗證碼發送失敗，請稍後重試');
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
      throw new Error('郵箱和驗證碼不能為空');
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
        throw new Error('驗證碼不正確');
      }

      // 檢查過期
      if (new Date() > verificationCode.expiresAt) {
        logAuthEvent('failed_verification', verificationCode.userId ?? undefined, { email, type, reason: 'expired' });
        throw new Error('驗證碼已過期，請重新申請');
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
      if (error instanceof Error && (error.message.includes('不正確') || error.message.includes('已過期'))) {
        throw error;
      }
      logError('Failed to verify code', error, { email, type });
      throw new Error('驗證失敗，請稍後重試');
    }
  }

  /**
   * 獲取用戶資料
   */
  static async buildUserProfile(userId: string): Promise<UserProfile | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        rewardProfile: {
          select: {
            tier: true,
          },
        },
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
      membershipLabel: `${user.rewardProfile?.tier || 'Basic'} Member`,
    };
  }

  /**
   * 请求注册Token (已整合到邮件验证流程)
   * 现在使用数据库存储验证码并发送邮件
   */
  static async requestRegisterToken(email: string): Promise<{ expiresIn: number }> {
    logDebug('Processing register token request (integrated email verification)', { email });

    if (!email) {
      throw new Error('邮箱不能为空');
    }

    // 使用新的邮件验证流程
    return this.sendVerificationCode(email, 'register');
  }

  /**
   * 确认注册 (已整合到邮件验证流程)
   * 现在使用数据库中的验证码而不是内存token
   */
  static async confirmRegister(email: string, registerToken: string, password: string): Promise<{ token: string; user: UserProfile }> {
    logDebug('Processing user registration confirmation (integrated email verification)', { email });

    // registerToken 现在被视为验证码
    // 使用新的邮件验证流程
    return this.verifyEmailAndRegister(email, registerToken, password);
  }

  /**
   * 用户登录
   */
  static async login(email: string, password: string): Promise<{ token: string; user: UserProfile }> {
    logDebug('Processing user login', { email });

    const startTime = Date.now();
    let user;
    try {
      user = await prisma.user.findUnique({ where: { email } });
    } catch (error) {
      // Handle database connection errors - treat as authentication failure
      if (error instanceof PrismaClientKnownRequestError) {
        logAuthEvent('failed_login', undefined, { email, reason: 'database_error' });
        throw new Error('帳號或密碼錯誤');
      }
      throw error;
    }

    if (!user || !(await bcrypt.compare(password, user.password))) {
      logAuthEvent('failed_login', undefined, { email, reason: 'invalid_credentials' });
      throw new Error('帳號或密碼錯誤');
    }

    logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

    const token = jwt.sign({ userId: user.id }, this.JWT_SECRET, { expiresIn: '7d' });
    const profile = await this.buildUserProfile(user.id);

    if (!profile) {
      throw new Error('Failed to create user profile');
    }

    logAuthEvent('login', user.id, { email });

    return { token, user: profile };
  }

  /**
   * 获取当前用户信息
   */
  static async getCurrentUser(userId: string): Promise<UserProfile> {
    const startTime = Date.now();
    const profile = await this.buildUserProfile(userId);
    logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

    if (!profile) {
      logError('User profile not found', new Error('User not found'), { userId });
      throw new Error('找不到使用者');
    }

    return profile;
  }

  /**
   * 获取当前用户信息（包括 Plaid 缓存统计）
   */
  static async getCurrentUserWithPlaidCache(userId: string): Promise<UserProfile> {
    const profile = await this.getCurrentUser(userId);

    try {
      // 获取 Plaid 缓存统计
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

      // 如果获取缓存统计失败，仍然返回用户资料（缓存信息是可选的）
      return profile;
    }
  }

  /**
   * 更新用户资料
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
      updateData.avatarUrl = payload.avatarBase64;  // 將 Base64 直接存儲在 avatarUrl 欄位
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
   * 请求密码重置 (整合邮件验证码模式)
   * 发送6位验证码到邮箱，而不是返回token
   */
  static async requestPasswordReset(email: string): Promise<{ expiresIn: number }> {
    logDebug('Processing password reset request', { email });

    if (!email) {
      throw new Error('邮箱不能为空');
    }

    try {
      const startTime = Date.now();
      const user = await prisma.user.findUnique({ where: { email } });
      logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

      if (!user) {
        // 不要透露用户是否存在，返回通用消息
        logAuthEvent('failed_password_reset_request', undefined, { email, reason: 'user_not_found' });
        // 返回成功以保护用户隐私
        return { expiresIn: 10 * 60 };
      }

      // 生成6位数字验证码
      const resetCode = Math.random().toString().slice(2, 8).padStart(6, '0');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10分钟过期

      const updateStartTime = Date.now();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetCode: resetCode,
          passwordResetExpiresAt: expiresAt,
        },
      });
      logDatabaseOperation('UPDATE', 'users', Date.now() - updateStartTime, true);

      logAuthEvent('password_reset_requested', user.id, { email });
      logBusinessEvent('password_reset_token_generated', user.id, { email });

      // 发送密码重置邮件
      const emailSent = await EmailService.sendPasswordResetEmail(email, resetCode, user.name || undefined);
      if (!emailSent) {
        logError('Failed to send password reset email', new Error('Email service failed'), { email });
        throw new Error('无法发送重置链接，请稍后重试');
      }

      logAuthEvent('password_reset_code_sent', user.id, { email });

      return { expiresIn: 10 * 60 }; // 秒数
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        logAuthEvent('failed_password_reset_request', undefined, { email, reason: 'database_error' });
        throw new Error('服务器错误，无法发送重置链接');
      }
      throw error;
    }
  }

  /**
   * 验证密码重置码并重置密码 (整合邮件验证码模式)
   */
  static async resetPassword(email: string, resetCode: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    logDebug('Processing password reset', { email });

    if (!email || !resetCode || !newPassword) {
      throw new Error('缺少必要参数');
    }

    if (newPassword.length < 6) {
      throw new Error('密码长度至少为 6 个字符');
    }

    if (resetCode.length !== 6 || !/^\d{6}$/.test(resetCode)) {
      throw new Error('验证码格式不正确');
    }

    try {
      const startTime = Date.now();
      const user = await prisma.user.findUnique({ where: { email } });
      logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

      if (!user) {
        logAuthEvent('failed_password_reset', undefined, { email, reason: 'user_not_found' });
        throw new Error('用户不存在');
      }

      // 检查验证码是否有效
      if (!user.passwordResetCode) {
        logAuthEvent('failed_password_reset_code', user.id, { email, reason: 'no_code_found' });
        throw new Error('重置码不存在或已过期，请重新请求');
      }

      const now = new Date();
      if (user.passwordResetExpiresAt && user.passwordResetExpiresAt < now) {
        logAuthEvent('failed_password_reset_code', user.id, { email, reason: 'code_expired' });
        throw new Error('重置码已过期，请重新请求');
      }

      if (user.passwordResetCode !== resetCode) {
        logAuthEvent('failed_password_reset_code', user.id, { email, reason: 'invalid_code' });
        throw new Error('重置码错误');
      }

      // 重置码有效，更新密码
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const updateStartTime = Date.now();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordResetCode: null,
          passwordResetExpiresAt: null,
        },
      });
      logDatabaseOperation('UPDATE', 'users', Date.now() - updateStartTime, true);

      logAuthEvent('password_reset_success', user.id, { email });
      logBusinessEvent('user_password_reset', user.id, { email });

      return {
        success: true,
        message: '密码已成功重置，请用新密码登录',
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        logAuthEvent('failed_password_reset', undefined, { email, reason: 'database_error' });
        throw new Error('服务器错误，无法重置密码');
      }
      throw error;
    }
  }

  /**
   * 删除用户账户
   */
  static async deleteAccount(userId: string, password: string): Promise<{ success: boolean; message: string }> {
    logDebug('Processing account deletion', { userId });

    if (!userId || !password) {
      throw new Error('缺少必要参数');
    }

    // 获取用户信息
    const startTime = Date.now();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, password: true },
    });
    logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

    if (!user) {
      logAuthEvent('failed_register', undefined, { userId, reason: 'user_not_found' });
      throw new Error('用户不存在');
    }

    // 验证密码
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      logAuthEvent('failed_register', undefined, { userId, email: user.email, reason: 'invalid_password' });
      throw new Error('密码不正确');
    }

    // 删除用户及其相关数据
    const deleteStartTime = Date.now();
    await prisma.user.delete({
      where: { id: userId },
    });
    logDatabaseOperation('DELETE', 'users', Date.now() - deleteStartTime, true);

    logAuthEvent('register', userId, { email: user.email, action: 'delete_account' });
    logBusinessEvent('user_account_deleted', userId, { email: user.email });

    return {
      success: true,
      message: '账户已成功删除',
    };
  }

  /**
   * 请求修改邮箱 - 发送验证码到新邮箱
   */
  static async requestEmailChange(userId: string, newEmail: string): Promise<{ expiresIn: number }> {
    logDebug('Processing email change request', { userId, newEmail });

    if (!userId || !newEmail) {
      throw new Error('缺少必要參數');
    }

    // 驗證新郵箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      throw new Error('無效的郵箱格式');
    }

    // 檢查新郵箱是否已被使用
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (existingUser) {
      throw new Error('該郵箱已被註冊');
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
      throw new Error('缺少必要參數');
    }

    // 驗證碼驗證
    const verification = await this.verifyCode(newEmail, code, 'email-change');

    if (!verification.valid) {
      throw new Error('驗證碼驗證失敗');
    }

    // 獲取當前用戶資訊
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new Error('用戶不存在');
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

    // 獲取更新後的用戶資料
    const profile = await this.buildUserProfile(userId);
    if (!profile) {
      throw new Error('無法獲取更新後的用戶資料');
    }

    return {
      success: true,
      message: '郵箱已成功修改',
      user: profile,
    };
  }

  /**
   * 验证邮箱验证码并注册 (第二步)
   */
  static async verifyEmailAndRegister(
    email: string,
    verificationCode: string,
    password: string
  ): Promise<{ token: string; user: UserProfile }> {
    logDebug('Verifying email and completing registration', { email });

    // 验证密码
    if (!password || password.length < 6) {
      throw new Error('密码长度至少為 6 個字符');
    }

    // 验证验证码格式
    if (!verificationCode || verificationCode.length !== 6) {
      throw new Error('驗證碼格式不正確');
    }

    try {
      // 使用新的统一验证码系统验证
      const verification = await this.verifyCode(email, verificationCode, 'register');

      if (!verification.valid) {
        throw new Error('驗證碼驗證失敗');
      }

      // 获取用户
      const startTime = Date.now();
      const user = await prisma.user.findUnique({ where: { email } });
      logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

      const hashedPassword = await bcrypt.hash(password, 10);

      let registeredUser;
      if (!user) {
        // 创建新用户（首次注册）
        const createStartTime = Date.now();
        registeredUser = await prisma.user.create({
          data: {
            email,
            password: hashedPassword,
            emailVerified: true,
          },
        });
        logDatabaseOperation('CREATE', 'users', Date.now() - createStartTime, true);
        logAuthEvent('register', registeredUser.id, { email });
      } else {
        // 更新现有用户（邮箱已存在，可能是重新验证）
        const updateStartTime = Date.now();
        registeredUser = await prisma.user.update({
          where: { id: user.id },
          data: {
            password: hashedPassword,
            emailVerified: true,
          },
        });
        logDatabaseOperation('UPDATE', 'users', Date.now() - updateStartTime, true);
      }

      // 生成 JWT token
      const token = jwt.sign({ userId: registeredUser.id }, this.JWT_SECRET, { expiresIn: '7d' });
      const userProfile = await this.buildUserProfile(registeredUser.id);

      if (!userProfile) {
        throw new Error('無法創建用戶資料');
      }

      logAuthEvent('email_verified', registeredUser.id, { email });
      logBusinessEvent('user_email_verified', registeredUser.id, { email });

      return { token, user: userProfile };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new Error('服務器錯誤，無法完成驗證');
      }
      throw error;
    }
  }

  /**
   * 重新發送驗證碼 (用於已註冊但未驗證的用戶)
   */
  static async resendVerificationCode(email: string): Promise<{ expiresIn: number }> {
    logDebug('Resending verification code', { email });

    return this.sendVerificationCode(email, 'register');
  }
}
