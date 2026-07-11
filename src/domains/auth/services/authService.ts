import * as jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '../../shared/lib/prisma';
import { getJwtSecret } from '../../../config/env';
import { logAuthEvent, logError, logDatabaseOperation, logBusinessEvent, logDebug } from '../../logger';
import { UserProfile, UpdateProfilePayload, PlaidCacheInfo } from '../models/types';
import { tierHasWebAccess } from '../../shared/lib/webTierAccess';
import { getCacheStats } from '../../plaid/lib/plaidCacheUtil';
import type { PrivyIdentity } from './privyService';
import {
  buildPlaceholderEmail,
  isPlaceholderEmail,
  resolveUserEmail,
} from '../lib/userEmailUtil';
import { AccountDeletionService } from './accountDeletionService';

/**
 * 認證服務 - 業務邏輯層
 *
 * 登入由 Privy 驅動：前端用 Privy 完成登入後，後端驗證 Privy token、
 * 對應到內部 user（以 privyUserId 為主鍵），再核發自有的 JWT session token。
 */

export class AuthService {
  private static normalizeReferralCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private static async generateUniqueReferCode(): Promise<string> {
    for (let i = 0; i < 10; i += 1) {
      const referCode = `RF${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const existing = await prisma.user.findUnique({
        where: { referCode },
        select: { id: true },
      });
      if (!existing) {
        return referCode;
      }
    }
    throw new Error('Unable to generate unique referral code');
  }

  private static async resolveInviterByReferralCode(referralCode: string): Promise<{ id: string; referCode: string }> {
    const inviter = await prisma.user.findUnique({
      where: { referCode: this.normalizeReferralCode(referralCode) },
      select: { id: true, referCode: true },
    });

    if (!inviter) {
      throw new Error('Invalid referral code');
    }

    return inviter;
  }

  /**
   * ============================================
   * Privy 登入
   * ============================================
   *
   * 以 Privy DID 為主鍵 upsert 使用者，綁定 embedded wallet，回傳自有 JWT。
   * 首次登入即註冊（無需獨立的註冊流程）。
   */
  static async loginWithPrivy(
    identity: PrivyIdentity,
    referralCode?: string,
  ): Promise<{
    token: string;
    user: UserProfile;
    needsKeyPairSetup: boolean;
    needsProfileSetup: boolean;
    emailConflict: boolean;
  }> {
    const { privyUserId, walletAddress } = identity;
    const identityEmail =
      identity.email && !isPlaceholderEmail(identity.email) ? identity.email : undefined;

    if (!privyUserId) {
      throw new Error('Missing Privy user id');
    }

    let resolved: { id: string; publicKey: string | null } | null = null;
    let email: string | undefined = identityEmail;
    // Privy 回報的 email 已被「另一個 Kura 帳號」使用時為 true：
    // 不阻擋登入、也不覆蓋 email，僅回報讓前端提示使用者去處理。
    let emailConflict = false;

    // 1. 以 privyUserId 查找既有帳號
    const byPrivy = await prisma.user.findUnique({
      where: { privyUserId },
      select: { id: true, publicKey: true, email: true },
    });
    if (byPrivy) {
      resolved = byPrivy;
      if (!email) {
        email = resolveUserEmail(byPrivy.id, byPrivy.email);
        if (!byPrivy.email) {
          await prisma.user.update({
            where: { id: byPrivy.id },
            data: { email },
          });
        }
      }
    }

    // 2. 尚未綁定 Privy 的同 email 帳號 → 連結到此 Privy 身分（略過 UUID placeholder）
    if (!resolved && email && !isPlaceholderEmail(email)) {
      const byEmail = await prisma.user.findUnique({
        where: { email },
        select: { id: true, publicKey: true, privyUserId: true },
      });
      if (byEmail) {
        if (byEmail.privyUserId && byEmail.privyUserId !== privyUserId) {
          throw new Error('Email is already linked to another account');
        }
        const linked = await prisma.user.update({
          where: { id: byEmail.id },
          data: {
            privyUserId,
            ...(walletAddress ? { walletAddress } : {}),
          },
          select: { id: true, publicKey: true },
        });
        resolved = linked;
        logAuthEvent('login', linked.id, { method: 'privy', action: 'link_existing' });
      }
    }

    // 3. 建立新帳號（首次登入即註冊）
    if (!resolved) {
      let inviter: { id: string; referCode: string } | undefined;
      if (referralCode) {
        try {
          inviter = await this.resolveInviterByReferralCode(referralCode);
        } catch {
          // 邀請碼無效不應阻擋登入；忽略即可（之後可用 /me/referral-code 補填）
          logDebug('Ignoring invalid referral code on Privy login', { referralCode });
        }
      }

      const createStartTime = Date.now();
      const newUserId = crypto.randomUUID();
      const storedEmail = email ?? buildPlaceholderEmail(newUserId);
      const created = await prisma.user.create({
        data: {
          id: newUserId,
          privyUserId,
          email: storedEmail,
          ...(walletAddress ? { walletAddress } : {}),
          referCode: await this.generateUniqueReferCode(),
          emailVerified: !!identityEmail,
          ...(inviter ? { referredByUserId: inviter.id, referredAt: new Date() } : {}),
        },
        select: { id: true, publicKey: true },
      });
      logDatabaseOperation('CREATE', 'users', Date.now() - createStartTime, true);
      logAuthEvent('register', created.id, { method: 'privy' });
      logBusinessEvent('user_registered_privy', created.id, {
        hasRealEmail: !!identityEmail,
        hasWallet: !!walletAddress,
      });
      resolved = created;
    } else {
      // 既有帳號（以 privyUserId 命中）：補寫 / 更新 wallet。
      // email 僅在「有值且未被其他帳號佔用」時才更新，否則會撞 email unique 約束。
      // placeholder email 可在 Privy 提供真實 email 時覆寫。
      let emailToUpdate: string | undefined;
      const currentUser = await prisma.user.findUnique({
        where: { id: resolved.id },
        select: { email: true },
      });
      const shouldRefreshEmail =
        !!identityEmail
        && (
          !currentUser?.email
          || isPlaceholderEmail(currentUser.email)
          || currentUser.email !== identityEmail
        );

      if (shouldRefreshEmail && identityEmail) {
        const emailOwner = await prisma.user.findUnique({
          where: { email: identityEmail },
          select: { id: true },
        });
        if (!emailOwner || emailOwner.id === resolved.id) {
          emailToUpdate = identityEmail;
        } else {
          emailConflict = true;
          logDebug('Skipping Privy email update: email already used by another account', {
            userId: resolved.id,
          });
        }
      }

      try {
        await prisma.user.update({
          where: { id: resolved.id },
          data: {
            ...(emailToUpdate ? { email: emailToUpdate } : {}),
            ...(walletAddress ? { walletAddress } : {}),
          },
        });
      } catch (error) {
        // 防競態：check 與 update 之間若 email 被別的帳號搶走，退回只更新 wallet，不阻擋登入
        if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
          emailConflict = true;
          logDebug('Privy email update hit unique conflict, updating wallet only', {
            userId: resolved.id,
          });
          if (walletAddress) {
            await prisma.user.update({
              where: { id: resolved.id },
              data: { walletAddress },
            });
          }
        } else {
          throw error;
        }
      }
    }

    const token = jwt.sign({ userId: resolved.id }, getJwtSecret(), { expiresIn: '7d' });
    const profile = await this.buildUserProfile(resolved.id);
    if (!profile) {
      throw new Error('Unable to build user profile');
    }

    logAuthEvent('login', resolved.id, { method: 'privy' });

    // needsProfileSetup: 用戶尚未主動設定過 displayName（name 欄位）→ 提示前端引導補資料
    // email 由 Privy 管理，後端不允許獨立修改，因此不納入判斷
    const needsProfileSetup = !profile.hasName;

    return {
      token,
      user: profile,
      needsKeyPairSetup: !resolved.publicKey,
      needsProfileSetup,
      emailConflict,
    };
  }

  private static async ensureStoredEmail(userId: string, storedEmail: string | null): Promise<string> {
    const uuidPlaceholder = buildPlaceholderEmail(userId);

    if (!storedEmail) {
      await prisma.user.update({
        where: { id: userId },
        data: { email: uuidPlaceholder },
      });
      return uuidPlaceholder;
    }

    if (isPlaceholderEmail(storedEmail) && storedEmail !== uuidPlaceholder) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { email: uuidPlaceholder },
        });
        return uuidPlaceholder;
      } catch (error) {
        if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
          return storedEmail;
        }
        throw error;
      }
    }

    return storedEmail;
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
        walletAddress: true,
        name: true,
        avatarUrl: true,
        tier: true,
        cashbackBalance: true,
        referCode: true,
        referredBy: {
          select: {
            referCode: true,
          },
        },
        _count: {
          select: {
            referredUsers: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    const effectiveEmail = await AuthService.ensureStoredEmail(user.id, user.email);
    const seed = effectiveEmail || user.walletAddress || user.id;
    const fallbackName = isPlaceholderEmail(effectiveEmail)
      ? (user.name || 'User')
      : (effectiveEmail.split('@')[0] || 'User');

    const tier = user.tier || 'Basic';

    return {
      id: user.id,
      email: effectiveEmail,
      emailIsPlaceholder: isPlaceholderEmail(effectiveEmail),
      walletAddress: user.walletAddress,
      displayName: (user.name || fallbackName) as string,
      hasName: !!user.name,
      avatarUrl:
        user.avatarUrl ||
        `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=e2e8f0`,
      membershipLabel: `${tier} Member`,
      tier,
      webAccessAllowed: tierHasWebAccess(tier),
      cashbackBalance: user.cashbackBalance || 0,
      referCode: user.referCode,
      referredByCode: user.referredBy?.referCode ?? null,
      referralCount: user._count.referredUsers,
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
      select: { email: true, privyUserId: true },
    });
    logDatabaseOperation('SELECT', 'users', Date.now() - startTime, true);

    if (!user) {
      logAuthEvent('failed_register', undefined, { userId, reason: 'user_not_found' });
      const error = new Error('User not found');
      (error as Error & { statusCode?: number }).statusCode = 404;
      throw error;
    }

    await AccountDeletionService.purgeExternalIntegrations(userId, user.privyUserId);

    // 刪除使用者及其相關資料（DB cascade）
    const deleteStartTime = Date.now();
    await prisma.user.delete({
      where: { id: userId },
    });
    logDatabaseOperation('DELETE', 'users', Date.now() - deleteStartTime, true);

    logAuthEvent('register', userId, { email: user.email ?? undefined, action: 'delete_account' });
    logBusinessEvent('user_account_deleted', userId, { email: user.email ?? undefined });

    return {
      success: true,
      message: 'Account deleted successfully',
    };
  }

  static async applyReferralCode(userId: string, referralCode: string): Promise<UserProfile> {
    const normalizedCode = this.normalizeReferralCode(referralCode);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referCode: true,
        referredByUserId: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }
    if (user.referredByUserId) {
      throw new Error('Referral code already applied');
    }
    if (normalizedCode === user.referCode) {
      throw new Error('You cannot use your own referral code');
    }

    const inviter = await this.resolveInviterByReferralCode(normalizedCode);

    await prisma.user.update({
      where: { id: userId },
      data: {
        referredByUserId: inviter.id,
        referredAt: new Date(),
      },
    });

    const profile = await this.buildUserProfile(userId);
    if (!profile) {
      throw new Error('Failed to fetch updated user profile');
    }

    return profile;
  }

  static async getReferralCashbackHistory(
    userId: string,
    options?: { status?: 'pending' | 'available' | 'reversed'; limit?: number },
  ): Promise<{
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
  }> {
    const limit = options?.limit ?? 50;
    const status = options?.status;

    const [rows, aggregates] = await Promise.all([
      prisma.referralCashback.findMany({
        where: {
          inviterUserId: userId,
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          referredUserId: true,
          stripeInvoiceId: true,
          stripeSubscriptionId: true,
          grossAmount: true,
          cashbackAmount: true,
          currency: true,
          status: true,
          availableAt: true,
          settledAt: true,
          reversedAt: true,
          reverseReason: true,
          createdAt: true,
          referred: {
            select: { email: true },
          },
        },
      }),
      prisma.referralCashback.groupBy({
        by: ['status'],
        where: { inviterUserId: userId },
        _sum: { cashbackAmount: true },
      }),
    ]);

    const byStatus = new Map(
      aggregates.map((agg) => [agg.status, Number(agg._sum.cashbackAmount || 0)]),
    );

    return {
      summary: {
        pending: byStatus.get('pending') || 0,
        available: byStatus.get('available') || 0,
        reversed: byStatus.get('reversed') || 0,
        totalEarned: (byStatus.get('available') || 0) - (byStatus.get('reversed') || 0),
      },
      items: rows.map((row) => ({
        id: row.id,
        referredUserId: row.referredUserId,
        referredUserEmail: row.referred?.email || null,
        stripeInvoiceId: row.stripeInvoiceId,
        stripeSubscriptionId: row.stripeSubscriptionId,
        grossAmount: row.grossAmount,
        cashbackAmount: row.cashbackAmount,
        currency: row.currency,
        status: row.status as 'pending' | 'available' | 'reversed',
        availableAt: row.availableAt,
        settledAt: row.settledAt,
        reversedAt: row.reversedAt,
        reverseReason: row.reverseReason,
        createdAt: row.createdAt,
      })),
    };
  }

}
