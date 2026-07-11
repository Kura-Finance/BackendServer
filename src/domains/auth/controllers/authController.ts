import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { logError } from '../../logger';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';

/**
 * 認證控制器 - 請求與回應處理
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
    // 使用者不存在回傳 404，資料庫錯誤回傳 503，其他錯誤回傳 500
    const isNotFoundError = error instanceof Error && error.message.toLowerCase().includes('not found');
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isNotFoundError ? 404 : isDatabaseError ? 503 : 500;
    const message = isNotFoundError && error instanceof Error ? error.message : 'Internal server error';
    sendError(res, statusCode, { code: isNotFoundError ? 'NOT_FOUND' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR', message });
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

export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    const result = await AuthService.requestPasswordReset(email);

    sendSuccess(res, {
      message: 'Password reset code sent. Please check your inbox.',
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    logError('Request password reset failed', error, { email: req.body.email });
    const isBusinessError = error instanceof Error && 
      (error.message.toLowerCase().includes('unable to send') || error.message.toLowerCase().includes('email'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isBusinessError ? 400 : isDatabaseError ? 503 : 500;
    const message = isBusinessError && error instanceof Error ? error.message : 'Internal server error';
    sendError(res, statusCode, {
      code: isBusinessError ? 'BUSINESS_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, resetCode, srpSalt, srpVerifier, encryptedDataKey, kekSalt, preserveData } = req.body;

    const result = await AuthService.resetPassword(
      email,
      resetCode,
      srpSalt,
      srpVerifier,
      encryptedDataKey,
      kekSalt,
      preserveData
    );
    sendSuccess(res, result);
  } catch (error) {
    logError('Reset password failed', error);
    // 驗證錯誤回傳 400，資料庫錯誤回傳 503，其他錯誤回傳 500
    const isValidationError = error instanceof Error && 
      (error.message.toLowerCase().includes('code') || error.message.toLowerCase().includes('expired') || 
       error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('password') || 
       error.message.toLowerCase().includes('missing') || error.message.toLowerCase().includes('not found'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isValidationError ? 400 : isDatabaseError ? 503 : 500;
    const message = isValidationError && error instanceof Error ? error.message : 'Internal server error';
    sendError(res, statusCode, {
      code: isValidationError ? 'VALIDATION_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
};

/**
 * 登出 - 清除 Cookie（網頁客戶端）
 */
export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // 清除登入 Cookie
    res.clearCookie('authToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    
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
    sendSuccess(res, result);
  } catch (error) {
    logError('Delete account failed', error, { userId: req.userId });
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isDatabaseError ? 503 : 500;
    const message = 'Internal server error';
    sendError(res, statusCode, { code: isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR', message });
  }
};

/**
 * 專用頭像修改介面 - 接收 Base64 編碼圖片
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
 * 修改顯示名稱 API
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


export const sendVerificationCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    const result = await AuthService.sendVerificationCode(email, 'register');

    sendSuccess(res, {
      message: 'Verification code sent to your email',
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    logError('Send verification code failed', error, { email: req.body.email });
    // 業務錯誤回傳具體訊息，資料庫錯誤回傳 503，其他錯誤回傳 500
    const isBusinessError = error instanceof Error && 
      (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('email') || 
       error.message.toLowerCase().includes('unable to send'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isBusinessError ? 400 : isDatabaseError ? 503 : 500;
    const message = isBusinessError && error instanceof Error ? error.message : 'Internal server error';
    sendError(res, statusCode, {
      code: isBusinessError ? 'BUSINESS_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
};

/**
 * 驗證郵箱驗證碼並完成註冊 (新註冊流程第二步)
 */
export const verifyEmailAndRegister = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, verificationCode, srpSalt, srpVerifier, encryptedDataKey, kekSalt } = req.body;
    const clientType = (req.headers['x-client-type'] as string || 'web') as 'web' | 'mobile';

    const result = await AuthService.verifyEmailAndRegister(email, verificationCode, {
      srpSalt,
      srpVerifier,
      encryptedDataKey,
      kekSalt,
    });
    
    if (clientType === 'web') {
      // 網頁客戶端：回傳 HttpOnly Cookie
      res.cookie('authToken', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      // 不回傳 token 給網頁客戶端
      sendSuccess(res, { message: 'Registration successful', user: result.user });
    } else {
      // 行動客戶端：回傳 JWT 權杖
      sendSuccess(res, result);
    }
  } catch (error) {
    logError('Verify email and register failed', error, { email: req.body.email });
    // 驗證錯誤回傳 400，資料庫錯誤回傳 503，其他錯誤回傳 500
    const isValidationError = error instanceof Error && 
      (error.message.toLowerCase().includes('registration') || error.message.toLowerCase().includes('verification') || 
       error.message.toLowerCase().includes('srp') || error.message.toLowerCase().includes('expired') || 
       error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('missing'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isValidationError ? 400 : isDatabaseError ? 503 : 500;
    const message = isValidationError && error instanceof Error ? error.message : 'Internal server error';
    sendError(res, statusCode, {
      code: isValidationError ? 'VALIDATION_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
};

/**
 * 請求修改郵箱 - 發送驗證碼到新郵箱
 */
export const requestEmailChange = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const { newEmail } = req.body;

    const result = await AuthService.requestEmailChange(userId, newEmail);

    sendSuccess(res, {
      message: 'Verification code sent to your new email. Please check your inbox.',
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    logError('Request email change failed', error, { userId: req.userId });
    const isBusinessError = error instanceof Error && 
      (error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('already') || 
       error.message.toLowerCase().includes('unable to send'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isBusinessError ? 400 : isDatabaseError ? 503 : 500;
    const message = isBusinessError && error instanceof Error ? error.message : 'Internal server error';
    sendError(res, statusCode, {
      code: isBusinessError ? 'BUSINESS_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
};

/**
 * 確認修改郵箱 - 驗證碼驗證成功則修改郵箱
 */
export const confirmEmailChange = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) {
      return;
    }

    const { newEmail, code } = req.body;

    const result = await AuthService.confirmEmailChange(userId, newEmail, code);

    sendSuccess(res, result);
  } catch (error) {
    logError('Confirm email change failed', error, { userId: req.userId });
    const isValidationError = error instanceof Error && 
      (error.message.toLowerCase().includes('verification') || error.message.toLowerCase().includes('expired') || 
       error.message.toLowerCase().includes('pending') || error.message.toLowerCase().includes('invalid') || 
       error.message.toLowerCase().includes('missing'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isValidationError ? 400 : isDatabaseError ? 503 : 500;
    const message = isValidationError && error instanceof Error ? error.message : 'Internal server error';
    sendError(res, statusCode, {
      code: isValidationError ? 'VALIDATION_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
};
