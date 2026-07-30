/**
 * Key Pair Controller
 *
 * HTTP endpoints for managing the user's E2EE keypair.
 *
 * Endpoints:
 *   POST  /api/auth/keys/setup    First-time keypair setup (rejects if already set)
 *   GET   /api/auth/keys/me       Fetch own keypair (incl. encryptedPrivateKey)
 *   POST  /api/auth/keys/rotate   Rotate keypair (invalidates existing wrappedSek)
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  KeyPairService,
  KeyPairAlreadyConfiguredError,
  KeyPairNotFoundError,
  InvalidKeyPairError,
} from '../services/keyPairService';
import { E2EEResetService } from '../services/e2eeResetService';
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
 * Return own keypair (incl. encryptedPrivateKey).
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
 * Warning: rotating the keypair invalidates all existing wrappedSek.
 *    PR 1 exposes this endpoint; client should re-encrypt data before/after calling.
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

/**
 * POST /api/auth/keys/reset
 *
 * New device / replace Passkey: wipe the E2EE layer (passkey + keypair + encrypted caches),
 * back to unconfigured. Client then runs fresh keypair setup + passkey registration,
 * and re-syncs protected data (Plaid / exchange / DeBank caches).
 *
 * Revokes all Plaid Items (must re-Link); exchange connections (ExchangeAccount) are kept.
 * Requires Privy login only — no old passkey assertion (user lost the passkey).
 */
export const resetE2EE = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await E2EEResetService.resetForUser(userId);
    sendSuccess(res, {
      reset: true,
      ...result,
    });
  } catch (error) {
    logError('E2EE reset failed', error, { userId: (req as AuthRequest).userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to reset E2EE layer' });
  }
};
