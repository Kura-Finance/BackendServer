import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../shared/lib/prisma';
import { logAuthEvent, logError, logDatabaseOperation, logBusinessEvent, logDebug } from '../../logger';
import { UserProfile, UpdateProfilePayload } from '../models/types';

/**
 * Auth Service - Business Logic Layer
 */

export class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'secret';

  /**
   * 获取用户资料
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
   * 用户注册
   */
  static async register(email: string, password: string): Promise<{ token: string; user: UserProfile }> {
    logDebug('Processing user registration', { email });

    const startTime = Date.now();
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      logAuthEvent('failed_register', undefined, { email, reason: 'email_already_exists' });
      throw new Error('Email 已被註冊');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        rewardProfile: {
          create: {
            tier: 'Basic',
          },
        },
      },
    });

    logDatabaseOperation('CREATE', 'users', Date.now() - startTime, true);

    const token = jwt.sign({ userId: user.id }, this.JWT_SECRET, { expiresIn: '7d' });
    const profile = await this.buildUserProfile(user.id);

    if (!profile) {
      throw new Error('Failed to create user profile');
    }

    logAuthEvent('register', user.id, { email });
    logBusinessEvent('new_user_registered', user.id, { email, tier: 'Basic' });

    return { token, user: profile };
  }

  /**
   * 用户登录
   */
  static async login(email: string, password: string): Promise<{ token: string; user: UserProfile }> {
    logDebug('Processing user login', { email });

    const startTime = Date.now();
    const user = await prisma.user.findUnique({ where: { email } });

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
}
