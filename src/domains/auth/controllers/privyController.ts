/**
 * Privy 認證控制器
 *
 * POST /api/auth/login
 *   Body: { accessToken, identityToken?, referralCode? }
 *   - 驗證 Privy access token → DID（登入權威證明）
 *   - 解析 email + embedded wallet（identity token 或 Privy Server API fallback）
 *   - 無 Privy email 時以內部 UUID placeholder 寫入 DB
 *   - upsert 內部 user，核發自有 JWT（web 用 cookie，mobile 用 Bearer）
 */

import { Request, Response } from 'express';
import { AuthService } from '../services/authService';
import {
  verifyAccessToken,
  resolvePrivyIdentity,
  PrivyTokenMismatchError,
} from '../services/privyService';
import { logError, logDebug, appLogger } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';

// Cookie 設定（與既有認證保持一致）
function setAuthCookie(res: Response, token: string): void {
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
  });
}

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { accessToken, identityToken, referralCode } = req.body as {
      accessToken: string;
      identityToken?: string;
      referralCode?: string;
    };

    const clientType = ((req.headers['x-client-type'] as string) || 'web') as 'web' | 'mobile';

    // 1. 驗證 access token → DID（登入權威證明）
    let did: string;
    logDebug('[Login] Received login request', {
      clientType,
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length,
      accessTokenPrefix: accessToken?.slice(0, 20),
      hasIdentityToken: !!identityToken,
    });

    // Decode JWT payload without verifying signature to expose aud/exp for diagnostics
    try {
      const rawPayload = accessToken.split('.')[1];
      if (rawPayload) {
        const decoded = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8')) as Record<string, unknown>;
        const exp = typeof decoded.exp === 'number' ? decoded.exp : null;
        appLogger.info('[Login] Token payload (unverified)', {
          aud: decoded.aud,
          iss: decoded.iss,
          sub: decoded.sub,
          exp,
          expDate: exp ? new Date(exp * 1000).toISOString() : null,
          nowDate: new Date().toISOString(),
          isExpired: exp ? exp < Date.now() / 1000 : null,
        });
      }
    } catch (_) { /* best-effort decode, ignore errors */ }

    try {
      did = await verifyAccessToken(accessToken);
    } catch (error) {
      const cause = (error as { cause?: unknown })?.cause;
      appLogger.warn('Privy access token verification failed', {
        error: error instanceof Error ? error.message : error,
        code: (error as { code?: string })?.code,
        cause: cause instanceof Error
          ? { message: cause.message, code: (cause as { code?: string }).code }
          : String(cause ?? ''),
      });
      sendError(res, 401, { code: 'INVALID_PRIVY_TOKEN', message: 'Invalid or expired Privy token' });
      return;
    }

    // 2. 解析 email + wallet（identity token → Privy API fallback）
    let identity;
    try {
      identity = await resolvePrivyIdentity(did, identityToken);
    } catch (error) {
      if (error instanceof PrivyTokenMismatchError) {
        sendError(res, 401, {
          code: 'PRIVY_TOKEN_MISMATCH',
          message: error.message,
        });
        return;
      }
      throw error;
    }

    // 3. upsert 內部 user + 核發自有 JWT
    const result = await AuthService.loginWithPrivy(identity, referralCode);

    if (clientType === 'web') {
      setAuthCookie(res, result.token);
      sendSuccess(res, {
        user: result.user,
        needsKeyPairSetup: result.needsKeyPairSetup,
        emailConflict: result.emailConflict,
      });
    } else {
      sendSuccess(res, {
        token: result.token,
        user: result.user,
        needsKeyPairSetup: result.needsKeyPairSetup,
        emailConflict: result.emailConflict,
      });
    }
  } catch (error) {
    logError('Privy login failed', error);
    const message = error instanceof Error ? error.message : 'Login failed';
    const normalized = message.toLowerCase();
    const isConflict = normalized.includes('already linked');
    const statusCode = isConflict ? 409 : 500;
    sendError(res, statusCode, {
      code: isConflict ? 'ACCOUNT_CONFLICT' : 'LOGIN_FAILED',
      message: isConflict ? message : 'Login failed',
    });
  }
};
