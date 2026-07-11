import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { logError } from '../../logger';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

/**
 * Auth Controller - Request/Response Handling
 */

/**
 * 第一步：请求注册Token (已整合到邮件验证)
 * 现在发送验证码Email而不是返回token
 */
export const requestRegisterToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: '邮箱不能为空' });
      return;
    }

    const result = await AuthService.requestRegisterToken(email);

    res.json({
      message: '验证码已发送到邮箱，请检查收件箱',
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    logError('Request register token failed', error, { email: req.body.email });
    // 业务错误返回具体消息，数据库错误返回503，其他错误返回500
    const isBusinessError = error instanceof Error && 
      (error.message.includes('已註冊') || error.message.includes('郵箱') || error.message.includes('無法發送'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isBusinessError ? 400 : isDatabaseError ? 503 : 500;
    const message = isBusinessError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};

/**
 * 第二步：使用Token确认注册
 */
export const confirmRegister = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, registerToken, password } = req.body;

    if (!email || !registerToken || !password) {
      res.status(400).json({ error: '邮箱、注册Token和密码不能为空' });
      return;
    }

    const result = await AuthService.confirmRegister(email, registerToken, password);
    res.json(result);
  } catch (error) {
    logError('Confirm register failed', error, { email: req.body.email });
    // 验证错误返回400，数据库错误返回503，其他错误返回500
    const isValidationError = error instanceof Error && 
      (error.message.includes('已注册') || error.message.includes('Token') || error.message.includes('密码'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isValidationError ? 400 : isDatabaseError ? 503 : 500;
    const message = isValidationError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    res.json(result);
  } catch (error) {
    logError('Login failed', error, { email: req.body.email });
    // 認證失敗返回401，數據庫錯誤返回503，其他錯誤返回通用錯誤
    const isAuthError = error instanceof Error && 
      (error.message.includes('邮箱') || error.message.includes('密码') || error.message.includes('未找到') || error.message.includes('帳號或密碼'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isAuthError ? 401 : isDatabaseError ? 503 : 500;
    const message = isAuthError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};

export const me = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const profile = await AuthService.getCurrentUserWithPlaidCache(req.userId);
    res.json({ user: profile });
  } catch (error) {
    logError('Fetch current user profile failed', error, { userId: (req as AuthRequest).userId });
    // 用户不存在返回404，数据库错误返回503，其他错误返回500
    const isNotFoundError = error instanceof Error && error.message.includes('找不到');
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isNotFoundError ? 404 : isDatabaseError ? 503 : 500;
    const message = isNotFoundError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { displayName, avatarUrl } = req.body;

    // 输入验证
    if (displayName !== undefined && !displayName) {
      res.status(400).json({ error: '顯示名稱不能為空' });
      return;
    }

    if (displayName !== undefined && displayName.length > 50) {
      res.status(400).json({ error: '顯示名稱長度不能超過 50 個字符' });
      return;
    }

    if (avatarUrl !== undefined && !avatarUrl) {
      res.status(400).json({ error: '頭像 URL 不能為空' });
      return;
    }

    if (avatarUrl !== undefined && avatarUrl.length > 500) {
      res.status(400).json({ error: '頭像 URL 長度不能超過 500 個字符' });
      return;
    }

    // 驗證 URL 格式
    if (avatarUrl !== undefined) {
      try {
        new URL(avatarUrl);
      } catch {
        res.status(400).json({ error: '無效的頭像 URL 格式' });
        return;
      }
    }

    const updatedProfile = await AuthService.updateUserProfile(req.userId, { displayName, avatarUrl });

    res.json({ user: updatedProfile });
  } catch (error) {
    logError('Update profile failed', error, { userId: (req as AuthRequest).userId });
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isDatabaseError ? 503 : 500;
    res.status(statusCode).json({ error: '伺服器錯誤' });
  }
};

export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: '郵箱不能為空' });
      return;
    }

    const result = await AuthService.requestPasswordReset(email);

    res.json({
      message: '重置碼已發送到郵箱，請檢查收件箱',
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    logError('Request password reset failed', error, { email: req.body.email });
    const isBusinessError = error instanceof Error && 
      (error.message.includes('無法發送') || error.message.includes('郵箱'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isBusinessError ? 400 : isDatabaseError ? 503 : 500;
    const message = isBusinessError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, resetCode, newPassword } = req.body;

    if (!email || !resetCode || !newPassword) {
      res.status(400).json({ error: '缺少必要參數' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: '密碼長度至少為 6 個字符' });
      return;
    }

    const result = await AuthService.resetPassword(email, resetCode, newPassword);
    res.json(result);
  } catch (error) {
    logError('Reset password failed', error);
    // 验证错误返回400，数据库错误返回503，其他错误返回500
    const isValidationError = error instanceof Error && 
      (error.message.includes('碼') || error.message.includes('過期') || error.message.includes('無效') || 
       error.message.includes('密碼') || error.message.includes('不存在'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isValidationError ? 400 : isDatabaseError ? 503 : 500;
    const message = isValidationError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};

export const deleteAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { password } = req.body || {};

    if (!password) {
      res.status(400).json({ error: '密碼不能為空' });
      return;
    }

    const result = await AuthService.deleteAccount(req.userId, password);
    res.json(result);
  } catch (error) {
    logError('Delete account failed', error, { userId: (req as AuthRequest).userId });
    // 密码错误返回401，数据库错误返回503，其他错误返回500
    const isAuthError = error instanceof Error && error.message.includes('密碼');
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isAuthError ? 401 : isDatabaseError ? 503 : 500;
    const message = isAuthError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};

/**
 * 专门修改头像 API - 接收 Base64 編碼的圖片
 */
export const updateAvatar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { avatar } = req.body;

    if (!avatar) {
      res.status(400).json({ error: '頭像數據不能為空' });
      return;
    }

    // 驗證 Base64 格式 (data:image/...;base64,...)
    const base64Regex = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
    if (!base64Regex.test(avatar)) {
      res.status(400).json({ error: '無效的 Base64 圖片格式，請使用 data:image/...;base64,... 格式' });
      return;
    }

    // 限制大小 (Base64 編碼後最多 10MB)
    if (avatar.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: '圖片大小不能超過 10MB' });
      return;
    }

    const updatedProfile = await AuthService.updateUserProfile(req.userId, { avatarBase64: avatar });

    res.json({ 
      message: '頭像已更新',
      user: updatedProfile 
    });
  } catch (error) {
    logError('Update avatar failed', error, { userId: (req as AuthRequest).userId });
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isDatabaseError ? 503 : 500;
    res.status(statusCode).json({ error: '伺服器錯誤' });
  }
};

/**
 * 修改顯示名稱 API
 */
export const updateDisplayName = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { displayName } = req.body;

    if (!displayName) {
      res.status(400).json({ error: '顯示名稱不能為空' });
      return;
    }

    if (displayName.length > 50) {
      res.status(400).json({ error: '顯示名稱長度不能超過 50 個字符' });
      return;
    }

    const updatedProfile = await AuthService.updateUserProfile(req.userId, { displayName });

    res.json({ 
      message: '顯示名稱已更新',
      user: updatedProfile 
    });
  } catch (error) {
    logError('Update display name failed', error, { userId: (req as AuthRequest).userId });
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isDatabaseError ? 503 : 500;
    res.status(statusCode).json({ error: '伺服器錯誤' });
  }
};


export const sendVerificationCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: '郵箱不能為空' });
      return;
    }

    const result = await AuthService.sendVerificationCode(email, 'register');

    res.json({
      message: '驗證碼已發送到郵箱',
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    logError('Send verification code failed', error, { email: req.body.email });
    // 业务错误返回具体消息，数据库错误返回503，其他错误返回500
    const isBusinessError = error instanceof Error && 
      (error.message.includes('已註冊') || error.message.includes('郵箱') || error.message.includes('無法發送'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isBusinessError ? 400 : isDatabaseError ? 503 : 500;
    const message = isBusinessError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};

/**
 * 驗證郵箱驗證碼並完成註冊 (新註冊流程第二步)
 */
export const verifyEmailAndRegister = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, verificationCode, password } = req.body;

    if (!email || !verificationCode || !password) {
      res.status(400).json({ error: '郵箱、驗證碼和密碼不能為空' });
      return;
    }

    const result = await AuthService.verifyEmailAndRegister(email, verificationCode, password);
    res.json(result);
  } catch (error) {
    logError('Verify email and register failed', error, { email: req.body.email });
    // 验证错误返回400，数据库错误返回503，其他错误返回500
    const isValidationError = error instanceof Error && 
      (error.message.includes('註冊') || error.message.includes('驗證碼') || error.message.includes('密碼') || 
       error.message.includes('過期') || error.message.includes('錯誤'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isValidationError ? 400 : isDatabaseError ? 503 : 500;
    const message = isValidationError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};

/**
 * 重新發送驗證碼 (用於已註冊但未驗證的用戶)
 */
export const resendVerificationCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: '郵箱不能為空' });
      return;
    }

    const result = await AuthService.resendVerificationCode(email);

    res.json({
      message: '驗證碼已重新發送到郵箱',
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    logError('Resend verification code failed', error, { email: req.body.email });
    const isBusinessError = error instanceof Error && 
      (error.message.includes('已註冊') || error.message.includes('郵箱') || error.message.includes('無法發送'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isBusinessError ? 400 : isDatabaseError ? 503 : 500;
    const message = isBusinessError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};

/**
 * 請求修改郵箱 - 發送驗證碼到新郵箱
 */
export const requestEmailChange = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { newEmail } = req.body;

    if (!newEmail) {
      res.status(400).json({ error: '新郵箱不能為空' });
      return;
    }

    const result = await AuthService.requestEmailChange(req.userId, newEmail);

    res.json({
      message: '驗證碼已發送到新郵箱，請檢查收件箱',
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    logError('Request email change failed', error, { userId: (req as AuthRequest).userId });
    const isBusinessError = error instanceof Error && 
      (error.message.includes('無效') || error.message.includes('已被') || error.message.includes('無法發送'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isBusinessError ? 400 : isDatabaseError ? 503 : 500;
    const message = isBusinessError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};

/**
 * 確認修改郵箱 - 驗證碼驗證成功則修改郵箱
 */
export const confirmEmailChange = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { newEmail, code } = req.body;

    if (!newEmail) {
      res.status(400).json({ error: '新郵箱不能為空' });
      return;
    }

    if (!code) {
      res.status(400).json({ error: '驗證碼不能為空' });
      return;
    }

    const result = await AuthService.confirmEmailChange(req.userId, newEmail, code);

    res.json(result);
  } catch (error) {
    logError('Confirm email change failed', error, { userId: (req as AuthRequest).userId });
    const isValidationError = error instanceof Error && 
      (error.message.includes('驗證碼') || error.message.includes('過期') || error.message.includes('待驗'));
    const isDatabaseError = error instanceof PrismaClientKnownRequestError;
    const statusCode = isValidationError ? 400 : isDatabaseError ? 503 : 500;
    const message = isValidationError && error instanceof Error ? error.message : '伺服器錯誤';
    res.status(statusCode).json({ error: message });
  }
};
