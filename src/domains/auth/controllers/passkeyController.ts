/**
 * Passkey / WebAuthn 控制器
 *
 * GET  /api/auth/passkey/status                  → { registered: boolean }
 * GET  /api/auth/passkey/register-challenge      → WebAuthn registration options
 * POST /api/auth/passkey/register                → 驗證 attestation + 儲存 encryptedDek
 * GET  /api/auth/passkey/authenticate-challenge  → WebAuthn authentication options
 * POST /api/auth/passkey/authenticate            → 驗證 assertion → { encryptedDek }
 *
 * 全部需登入（Privy JWT）；passkey 是登入後解鎖 E2EE 資料層的第二步。
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as PasskeyService from '../services/passkeyService';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';

function getUserId(req: AuthRequest, res: Response): string | null {
  if (!req.userId) {
    sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return null;
  }
  return req.userId;
}

export const status = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const result = await PasskeyService.getStatus(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Passkey status failed', error, { userId: req.userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch passkey status' });
  }
};

export const list = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const passkeys = await PasskeyService.listPasskeys(userId);
    sendSuccess(res, { passkeys, count: passkeys.length });
  } catch (error) {
    logError('Passkey list failed', error, { userId: req.userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to list passkeys' });
  }
};

export const remove = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const credentialDbId = req.params.credentialId as string;
    if (!credentialDbId) {
      sendError(res, 400, { code: 'INVALID_REQUEST', message: 'credentialId is required' });
      return;
    }

    const result = await PasskeyService.deletePasskey(userId, credentialDbId);
    sendSuccess(res, result);
  } catch (error) {
    if (error instanceof PasskeyService.LastPasskeyError) {
      sendError(res, 409, { code: 'PASSKEY_LAST_REMAINING', message: error.message });
      return;
    }
    if (error instanceof PasskeyService.PasskeyNotFoundError) {
      sendError(res, 404, { code: 'PASSKEY_NOT_FOUND', message: error.message });
      return;
    }
    logError('Passkey delete failed', error, { userId: req.userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to remove passkey' });
  }
};

export const registerChallenge = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const options = await PasskeyService.createRegistrationOptions(userId);
    sendSuccess(res, options);
  } catch (error) {
    logError('Passkey register challenge failed', error, { userId: req.userId });
    const message = error instanceof Error ? error.message : 'Failed to create registration challenge';
    sendError(res, 500, { code: 'PASSKEY_CHALLENGE_FAILED', message });
  }
};

export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const { response, encryptedDek } = req.body as {
      response: Parameters<typeof PasskeyService.verifyRegistration>[1];
      encryptedDek: string;
    };

    const result = await PasskeyService.verifyRegistration(userId, response, encryptedDek);
    if (!result.verified) {
      sendError(res, 400, { code: 'PASSKEY_VERIFICATION_FAILED', message: 'Passkey registration could not be verified' });
      return;
    }

    sendSuccess(res, { verified: true }, 201);
  } catch (error) {
    logError('Passkey register failed', error, { userId: req.userId });
    const message = error instanceof Error ? error.message : 'Failed to register passkey';
    const normalized = message.toLowerCase();
    const isClientError = normalized.includes('challenge') || normalized.includes('expired');
    sendError(res, isClientError ? 400 : 500, {
      code: isClientError ? 'PASSKEY_CHALLENGE_INVALID' : 'PASSKEY_REGISTER_FAILED',
      message,
    });
  }
};

export const authenticateChallenge = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const options = await PasskeyService.createAuthenticationOptions(userId);
    sendSuccess(res, options);
  } catch (error) {
    logError('Passkey authenticate challenge failed', error, { userId: req.userId });
    const message = error instanceof Error ? error.message : 'Failed to create authentication challenge';
    const normalized = message.toLowerCase();
    const isNotRegistered = normalized.includes('no passkey');
    sendError(res, isNotRegistered ? 404 : 500, {
      code: isNotRegistered ? 'PASSKEY_NOT_REGISTERED' : 'PASSKEY_CHALLENGE_FAILED',
      message,
    });
  }
};

export const authenticate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const { response } = req.body as {
      response: Parameters<typeof PasskeyService.verifyAuthentication>[1];
    };

    const result = await PasskeyService.verifyAuthentication(userId, response);
    if (!result.verified) {
      sendError(res, 401, { code: 'PASSKEY_VERIFICATION_FAILED', message: 'Passkey assertion could not be verified' });
      return;
    }

    sendSuccess(res, { encryptedDek: result.encryptedDek });
  } catch (error) {
    logError('Passkey authenticate failed', error, { userId: req.userId });
    const message = error instanceof Error ? error.message : 'Failed to authenticate passkey';
    const normalized = message.toLowerCase();
    const isClientError =
      normalized.includes('challenge') || normalized.includes('expired') || normalized.includes('not found');
    sendError(res, isClientError ? 400 : 500, {
      code: isClientError ? 'PASSKEY_CHALLENGE_INVALID' : 'PASSKEY_AUTH_FAILED',
      message,
    });
  }
};
