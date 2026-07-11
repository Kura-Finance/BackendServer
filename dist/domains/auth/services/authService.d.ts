import { UserProfile, UpdateProfilePayload } from '../models/types';
import type { PrivyIdentity } from './privyService';
/**
 * 認證服務 - 業務邏輯層
 *
 * 登入由 Privy 驅動：前端用 Privy 完成登入後，後端驗證 Privy token、
 * 對應到內部 user（以 privyUserId 為主鍵），再核發自有的 JWT session token。
 */
export declare class AuthService {
    private static normalizeReferralCode;
    private static generateUniqueReferCode;
    private static resolveInviterByReferralCode;
    /**
     * ============================================
     * Privy 登入
     * ============================================
     *
     * 以 Privy DID 為主鍵 upsert 使用者，綁定 embedded wallet，回傳自有 JWT。
     * 首次登入即註冊（無需獨立的註冊流程）。
     */
    static loginWithPrivy(identity: PrivyIdentity, referralCode?: string): Promise<{
        token: string;
        user: UserProfile;
        needsKeyPairSetup: boolean;
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
     * 刪除使用者帳戶
     */
    static deleteAccount(userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    static applyReferralCode(userId: string, referralCode: string): Promise<UserProfile>;
    static getReferralCashbackHistory(userId: string, options?: {
        status?: 'pending' | 'available' | 'reversed';
        limit?: number;
    }): Promise<{
        summary: {
            pending: number;
            available: number;
            reversed: number;
            totalEarned: number;
        };
        items: Array<{
            id: string;
            referredUserId: string;
            referredUserEmail: string | null;
            stripeInvoiceId: string;
            stripeSubscriptionId: string | null;
            grossAmount: number;
            cashbackAmount: number;
            currency: string;
            status: 'pending' | 'available' | 'reversed';
            availableAt: Date;
            settledAt: Date | null;
            reversedAt: Date | null;
            reverseReason: string | null;
            createdAt: Date;
        }>;
    }>;
}
//# sourceMappingURL=authService.d.ts.map