import { UserProfile, UpdateProfilePayload } from '../models/types';
/**
 * 注册流程已整合为邮件验证模式
 * 使用数据库存储验证码，而不是内存缓存
 */
/**
 * Auth Service - Business Logic Layer
 */
export declare class AuthService {
    private static readonly JWT_SECRET;
    private static readonly REGISTER_TOKEN_EXPIRY;
    private static readonly VERIFICATION_CODE_EXPIRY;
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
    static sendVerificationCode(email: string, type: 'register' | 'password-reset' | 'email-change', userId?: string, metadata?: Record<string, unknown>): Promise<{
        expiresIn: number;
    }>;
    /**
     * 驗證碼驗證 (通用方法)
     * @param email 目標郵箱
     * @param code 驗證碼
     * @param type 驗證碼類型
     * @returns { valid: boolean; metadata?: unknown }
     */
    static verifyCode(email: string, code: string, type: 'register' | 'password-reset' | 'email-change'): Promise<{
        valid: boolean;
        metadata?: unknown;
    }>;
    /**
     * 獲取用戶資料
     */
    static buildUserProfile(userId: string): Promise<UserProfile | null>;
    /**
     * 请求注册Token (已整合到邮件验证流程)
     * 现在使用数据库存储验证码并发送邮件
     */
    static requestRegisterToken(email: string): Promise<{
        expiresIn: number;
    }>;
    /**
     * 确认注册 (已整合到邮件验证流程)
     * 现在使用数据库中的验证码而不是内存token
     */
    static confirmRegister(email: string, registerToken: string, password: string): Promise<{
        token: string;
        user: UserProfile;
    }>;
    /**
     * 用户登录
     */
    static login(email: string, password: string): Promise<{
        token: string;
        user: UserProfile;
    }>;
    /**
     * 获取当前用户信息
     */
    static getCurrentUser(userId: string): Promise<UserProfile>;
    /**
     * 获取当前用户信息（包括 Plaid 缓存统计）
     */
    static getCurrentUserWithPlaidCache(userId: string): Promise<UserProfile>;
    /**
     * 更新用户资料
     */
    static updateUserProfile(userId: string, payload: UpdateProfilePayload): Promise<UserProfile>;
    /**
     * 请求密码重置 (整合邮件验证码模式)
     * 发送6位验证码到邮箱，而不是返回token
     */
    static requestPasswordReset(email: string): Promise<{
        expiresIn: number;
    }>;
    /**
     * 验证密码重置码并重置密码 (整合邮件验证码模式)
     */
    static resetPassword(email: string, resetCode: string, newPassword: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 删除用户账户
     */
    static deleteAccount(userId: string, password: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 请求修改邮箱 - 发送验证码到新邮箱
     */
    static requestEmailChange(userId: string, newEmail: string): Promise<{
        expiresIn: number;
    }>;
    /**
     * 確認修改郵箱 - 驗證碼驗證成功則修改郵箱
     */
    static confirmEmailChange(userId: string, newEmail: string, code: string): Promise<{
        success: boolean;
        message: string;
        user: UserProfile;
    }>;
    /**
     * 验证邮箱验证码并注册 (第二步)
     */
    static verifyEmailAndRegister(email: string, verificationCode: string, password: string): Promise<{
        token: string;
        user: UserProfile;
    }>;
    /**
     * 重新發送驗證碼 (用於已註冊但未驗證的用戶)
     */
    static resendVerificationCode(email: string): Promise<{
        expiresIn: number;
    }>;
}
//# sourceMappingURL=authService.d.ts.map