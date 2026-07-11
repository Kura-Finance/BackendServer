import { UserProfile, UpdateProfilePayload } from '../models/types';
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
export declare class AuthService {
    private static readonly JWT_SECRET;
    private static readonly VERIFICATION_CODE_EXPIRY;
    private static normalizeHex;
    private static isHexString;
    private static assertRequiredSrpPayload;
    private static assertValidSrpPayload;
    private static normalizeSrpPayload;
    private static buildSrpAuthUpdateData;
    private static updateUserSrpAuthById;
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
     * 取得使用者資料
     */
    static buildUserProfile(userId: string): Promise<UserProfile | null>;
    /**
     * 取得當前使用者資訊
     */
    static getCurrentUser(userId: string): Promise<UserProfile>;
    /**
     * 取得當前使用者資訊（包含 Plaid 快取統計）
     */
    static getCurrentUserWithPlaidCache(userId: string): Promise<UserProfile>;
    /**
     * 更新使用者資料
     */
    static updateUserProfile(userId: string, payload: UpdateProfilePayload): Promise<UserProfile>;
    /**
     * 請求密碼重置 (整合郵件驗證碼模式)
     * 發送 6 位驗證碼到郵箱，而不是回傳 token
     */
    static requestPasswordReset(email: string): Promise<{
        expiresIn: number;
    }>;
    /**
     * 驗證密碼重置碼並重置密碼 (整合郵件驗證碼模式)
     */
    static resetPassword(email: string, resetCode: string, srpSalt: string, srpVerifier: string, encryptedDataKey: string, kekSalt: string, preserveData?: boolean): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 刪除使用者帳戶
     */
    static deleteAccount(userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 請求修改郵箱 - 發送驗證碼到新郵箱
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
     * 驗證郵箱驗證碼並註冊 (第二步)
     */
    static verifyEmailAndRegister(email: string, verificationCode: string, srpData: SRPAuthPayload): Promise<{
        token: string;
        user: UserProfile;
    }>;
}
export {};
//# sourceMappingURL=authService.d.ts.map