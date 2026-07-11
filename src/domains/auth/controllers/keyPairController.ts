/**
 * Key Pair Controller
 *
 * 提供使用者管理 E2EE keypair 的 HTTP endpoints。
 *
 * Endpoints：
 *   POST  /api/auth/keys/setup    首次設定 keypair（已有則拒絕）
 *   GET   /api/auth/keys/me       取得自己的 keypair（含 encryptedPrivateKey）
 *   POST  /api/auth/keys/rotate   輪替 keypair（會讓既有 wrappedSek 失效）
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  KeyPairService,
  KeyPairAlreadyConfiguredError,
  KeyPairNotFoundError,
  InvalidKeyPairError,
} from '../services/keyPairService';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';

function getAuthenticatedUserId(req: AuthRequest, res: Response): string | null {
  if (!req.userId) {
    sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return null;
  }
  return req.userId;
}

function handleServiceError(res: Response, error: unknown, fallbackMsg: string): void {
  if (error instanceof KeyPairAlreadyConfiguredError) {
    sendError(res, 409, {
      code: 'KEY_PAIR_ALREADY_CONFIGURED',
      message: 'Key pair is already configured. Use rotate to replace it.',
    });
    return;
  }
  if (error instanceof KeyPairNotFoundError) {
    sendError(res, 404, {
      code: 'KEY_PAIR_NOT_FOUND',
      message: 'No key pair has been configured yet. Call /api/auth/keys/setup first.',
    });
    return;
  }
  if (error instanceof InvalidKeyPairError) {
    sendError(res, 400, {
      code: 'INVALID_KEY_PAIR',
      message: error.message,
    });
    return;
  }

  logError('Key pair endpoint failed', error);
  sendError(res, 500, { code: 'INTERNAL_ERROR', message: fallbackMsg });
}

/**
 * POST /api/auth/keys/setup
 * Body: { publicKey, encryptedPrivateKey }
 */
export const setupKeyPair = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { publicKey, encryptedPrivateKey, kekSalt } = req.body;
    const view = await KeyPairService.setup(userId, { publicKey, encryptedPrivateKey, kekSalt });
    sendSuccess(res, {
      publicKey: view.publicKey,
      encryptedPrivateKey: view.encryptedPrivateKey,
      kekSalt: view.kekSalt,
      algorithm: view.algorithm,
      createdAt: view.createdAt,
    });
  } catch (error) {
    handleServiceError(res, error, 'Failed to setup key pair');
  }
};

/**
 * GET /api/auth/keys/me
 * 回傳自己的 keypair（含 encryptedPrivateKey）。
 */
export const getMyKeyPair = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const view = await KeyPairService.getMine(userId);
    sendSuccess(res, {
      publicKey: view.publicKey,
      encryptedPrivateKey: view.encryptedPrivateKey,
      kekSalt: view.kekSalt,
      algorithm: view.algorithm,
      createdAt: view.createdAt,
    });
  } catch (error) {
    handleServiceError(res, error, 'Failed to fetch key pair');
  }
};

/**
 * POST /api/auth/keys/rotate
 * Body: { publicKey, encryptedPrivateKey }
 *
 * ⚠️ 輪替 keypair 會讓所有既有 wrappedSek 失效。
 *    PR 1 階段先暴露此 endpoint，但客戶端應在呼叫前 / 後處理資料重新加密。
 */
export const rotateKeyPair = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { publicKey, encryptedPrivateKey, kekSalt } = req.body;
    const view = await KeyPairService.rotate(userId, { publicKey, encryptedPrivateKey, kekSalt });
    sendSuccess(res, {
      publicKey: view.publicKey,
      encryptedPrivateKey: view.encryptedPrivateKey,
      kekSalt: view.kekSalt,
      algorithm: view.algorithm,
      createdAt: view.createdAt,
    });
  } catch (error) {
    handleServiceError(res, error, 'Failed to rotate key pair');
  }
};
