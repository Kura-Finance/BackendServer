import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { logError } from '../../logger';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';

/**
 * Auth controller — request/response handling.
 *
 * Login is Privy-driven (see privyController). This controller covers
 * post-login profile, logout, invite codes, cashback history/withdraw, and account deletion.
 */

function getAuthenticatedUserId(req: AuthRequest, res: Response): string | null {
  if (!req.userId) {
    sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return null;
  }

  return req.userId;
}

export const me = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const profile = await AuthService.getCurrentUserWithPlaidCache(userId);
    sendSuccess(res, { user: profile });
  } catch (error) {
    logError('Fetch current user profile failed', error, { userId: req.userId });
    const code = (error as { code?: string }).code;
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (code === 'FRAUD_SUSPENDED') {
      res.clearCookie('authToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      });
      sendError(res, 403, {
        code: 'FRAUD_SUSPENDED',
        message: message || '此帳號因欺詐警報已被停用，無法登入。',
      });
      return;
    }
    // Missing user → 404; DB errors → 503; otherwise → 500
    const isNotFoundError = error instanceof Error && error.message.toLowerCase().includes('not found');
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isNotFoundError ? 404 : isDatabaseError ? 503 : 500;
    sendError(res, statusCode, {
      code: isNotFoundError ? 'NOT_FOUND' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
      message: isNotFoundError ? message : 'Internal server error',
    });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const { displayName, avatarUrl } = req.body;

    const updatedProfile = await AuthService.updateUserProfile(userId, { displayName, avatarUrl });

    sendSuccess(res, { user: updatedProfile });
  } catch (error) {
    logError('Update profile failed', error, { userId: (req as AuthRequest).userId });
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isDatabaseError ? 503 : 500;
    sendError(res, statusCode, { code: isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * Logout — clear Cookie (web clients)
 */
function clearAuthCookie(res: Response): void {
  res.clearCookie('authToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
}

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    clearAuthCookie(res);
    sendSuccess(res, { message: 'Logged out successfully' });
  } catch (error) {
    logError('Logout failed', error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Logout failed' });
  }
};

export const deleteAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const result = await AuthService.deleteAccount(userId);
    clearAuthCookie(res);
    sendSuccess(res, result);
  } catch (error) {
    logError('Delete account failed', error, { userId: req.userId });
    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = (error as { statusCode?: number }).statusCode
      ?? (error instanceof PrismaClientKnownRequestError ? 503 : 500);
    const code = (error as { code?: string }).code;
    const isNotFound = statusCode === 404 || message.toLowerCase().includes('not found');
    if (code === 'FRAUD_SUSPENDED') {
      sendError(res, 403, { code: 'FRAUD_SUSPENDED', message });
      return;
    }
    sendError(res, isNotFound ? 404 : statusCode, {
      code: isNotFound ? 'NOT_FOUND' : statusCode === 503 ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
      message: isNotFound ? message : 'Internal server error',
    });
  }
};

/**
 * Dedicated avatar update — accepts Base64 image
 */
export const updateAvatar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const { avatar } = req.body;

    const updatedProfile = await AuthService.updateUserProfile(userId, { avatarBase64: avatar });

    sendSuccess(res, {
      message: 'Avatar updated successfully',
      user: updatedProfile
    });
  } catch (error) {
    logError('Update avatar failed', error, { userId: req.userId });
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isDatabaseError ? 503 : 500;
    sendError(res, statusCode, { code: isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * Update display-name API
 */
export const updateDisplayName = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const { displayName } = req.body;

    const updatedProfile = await AuthService.updateUserProfile(userId, { displayName });

    sendSuccess(res, {
      message: 'Display name updated successfully',
      user: updatedProfile
    });
  } catch (error) {
    logError('Update display name failed', error, { userId: req.userId });
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isDatabaseError ? 503 : 500;
    sendError(res, statusCode, { code: isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

export const applyReferralCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const { referralCode } = req.body as { referralCode: string };
    const user = await AuthService.applyReferralCode(userId, referralCode);
    sendSuccess(res, {
      message: 'Referral code applied successfully',
      user,
    });
  } catch (error) {
    logError('Apply referral code failed', error, { userId: req.userId });
    const message = error instanceof Error ? error.message : 'Failed to apply referral code';
    const normalized = message.toLowerCase();
    const isValidationError =
      normalized.includes('invalid') ||
      normalized.includes('already') ||
      normalized.includes('cannot use your own');
    const statusCode = isValidationError ? 400 : 500;
    sendError(res, statusCode, {
      code: isValidationError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
};

export const getMyCashbackHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const status = req.query.status as 'pending' | 'available' | 'reversed' | undefined;
    const limit = Number(req.query.limit) || 50;
    const result = await AuthService.getReferralCashbackHistory(userId, {
      limit,
      ...(status ? { status } : {}),
    });
    sendSuccess(res, result);
  } catch (error) {
    logError('Get cashback history failed', error, { userId: req.userId });
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isDatabaseError ? 503 : 500;
    sendError(res, statusCode, {
      code: isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
};

export const withdrawCashback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const { amount, destinationAddress } = req.body as {
      amount: number;
      destinationAddress: string;
    };

    const { ReferralCashbackService } = await import('../services/referralCashbackService');
    const result = await ReferralCashbackService.requestWithdrawal({
      userId,
      amount,
      destinationAddress,
    });

    sendSuccess(res, {
      message: 'Cashback withdrawal requested',
      withdrawal: result,
    });
  } catch (error) {
    logError('Withdraw cashback failed', error, { userId: req.userId });
    const message = error instanceof Error ? error.message : 'Failed to withdraw cashback';
    const normalized = message.toLowerCase();
    const isValidationError =
      normalized.includes('amount') ||
      normalized.includes('address') ||
      normalized.includes('insufficient');
    const statusCode = isValidationError ? 400 : 500;
    sendError(res, statusCode, {
      code: isValidationError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
};
