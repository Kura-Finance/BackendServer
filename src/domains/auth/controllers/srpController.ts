/**
 * SRP 控制器
 * 處理 SRP 零知識認證的 HTTP 請求
 */

import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth';
import { SRPService } from '../services/srpService';
import { AuthService } from '../services/authService';
import { logError, logDebug } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Cookie 設定（與現有認證控制器保持一致）
function setAuthCookie(res: Response, token: string): void {
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
  });
}

function getAuthenticatedUserId(req: AuthRequest, res: Response): string | null {
  if (!req.userId) {
    sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return null;
  }

  return req.userId;
}

/**
 * POST /api/auth/srp/salt
 * 取得使用者的 salt（不需要認證，salt 本身是公開的）
 * 用戶端使用 salt + 密碼推導 Master Key
 */
export const srpGetSalt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    const normalizedEmail = email.toLowerCase().trim();
    const salts = await SRPService.getSaltForEmail(normalizedEmail);
    if (!salts) {
      // 帳號不存在或尚未升級 SRP；回傳穩定的假 salt 與 srpEnabled: false
      // 前端看到 srpEnabled: false 應引導註冊/重設，不再走舊版密碼登入流程
      sendSuccess(res, {
        srpSalt: SRPService.generateStableFakeSalt(normalizedEmail, 'srp'),
        kekSalt: SRPService.generateStableFakeSalt(normalizedEmail, 'kek'),
        srpEnabled: false,
      });
      return;
    }

    sendSuccess(res, salts); // salts 已含 srpEnabled: true
  } catch (error) {
    logError('SRP get salt failed', error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * POST /api/auth/srp/challenge
 * SRP 登入階段 1：用戶端傳入 A，伺服器回傳 B + salt
 */
export const srpChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    const result = await SRPService.srpChallenge(email.toLowerCase().trim());
    sendSuccess(res, result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Login failed';
    logError('SRP challenge failed', error);
    sendError(res, 401, { code: 'AUTH_FAILED', message: msg });
  }
};

/**
 * POST /api/auth/srp/verify
 * SRP 登入階段 2：用戶端傳入 M1，伺服器驗證並回傳 M2 + JWT token
 */
export const srpVerify = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId, clientA, clientM1 } = req.body;

    const { userId, serverM2 } = await SRPService.srpVerify(sessionId, clientA, clientM1);

    // 發行 JWT 權杖（與現有系統相容）
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, token);

    const profile = await AuthService.buildUserProfile(userId);

    logDebug('SRP login successful', { userId });

    sendSuccess(res, {
      serverM2,
      token, // Mobile 客戶端用
      user: profile,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Verification failed';
    logError('SRP verify failed', error);
    sendError(res, 401, { code: 'AUTH_FAILED', message: msg });
  }
};

/**
 * POST /api/auth/srp/setup
 * 為現有帳號設定 SRP（需要已登入）
 * 用戶端在本地完成金鑰推導（key derivation）後，上傳 verifier 與加密後的 Data Key
 *
 * 請求本文 Body：{ srpSalt, srpVerifier, encryptedDataKey, kekSalt }
 * - srpSalt: Argon2id salt（hex），用於用戶端推導 Master Key
 * - srpVerifier: SRP 驗證值 verifier（hex），伺服器儲存，不可反推密碼
 * - encryptedDataKey: AES-GCM(DataKey, KEK)，伺服器無法解密
 * - kekSalt: KEK 推導用 salt
 */
export const srpSetup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const { srpSalt, srpVerifier, encryptedDataKey, kekSalt } = req.body;

    await SRPService.storeVerifier(userId, srpSalt, srpVerifier, encryptedDataKey, kekSalt);

    logDebug('SRP setup completed', { userId });
    sendSuccess(res, { message: 'SRP authentication enabled' });
  } catch (error) {
    logError('SRP setup failed', error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * GET /api/auth/srp/data-key
 * 取得已登入使用者的加密 Data Key
 * 用戶端使用 KEK 解密後使用
 */
export const srpDataKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const { prisma } = await import('../../shared/lib/prisma');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { encryptedDataKey: true, kekSalt: true },
    });

    if (!user?.encryptedDataKey) {
      sendError(res, 404, { code: 'NOT_FOUND', message: 'SRP is not configured yet. Complete setup first.' });
      return;
    }

    sendSuccess(res, {
      encryptedDataKey: user.encryptedDataKey,
      kekSalt: user.kekSalt,
    });
  } catch (error) {
    logError('SRP data key fetch failed', error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * POST /api/auth/srp/generate-data-key
 * 停用：Zero Access/Zero Knowledge 模式下，DEK 必須由用戶端本地生成。
 */
export const srpGenerateDataKeyDisabled = async (_req: AuthRequest, res: Response): Promise<void> => {
  sendError(res, 410, {
    code: 'GONE',
    message: 'Endpoint disabled. Generate data key on client and upload only encryptedDataKey via /srp/setup or /register/verify.',
  });
};

