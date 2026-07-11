"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmEmailChange = exports.requestEmailChange = exports.verifyEmailAndRegister = exports.sendVerificationCode = exports.updateDisplayName = exports.updateAvatar = exports.deleteAccount = exports.logout = exports.resetPassword = exports.requestPasswordReset = exports.updateProfile = exports.me = void 0;
const authService_1 = require("../services/authService");
const logger_1 = require("../../logger");
const library_1 = require("@prisma/client/runtime/library");
const apiResponse_1 = require("../../shared/lib/apiResponse");
/**
 * 認證控制器 - 請求與回應處理
 */
function getAuthenticatedUserId(req, res) {
    if (!req.userId) {
        (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
        return null;
    }
    return req.userId;
}
const me = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req, res);
        if (!userId) {
            return;
        }
        const profile = await authService_1.AuthService.getCurrentUserWithPlaidCache(userId);
        (0, apiResponse_1.sendSuccess)(res, { user: profile });
    }
    catch (error) {
        (0, logger_1.logError)('Fetch current user profile failed', error, { userId: req.userId });
        // 使用者不存在回傳 404，資料庫錯誤回傳 503，其他錯誤回傳 500
        const isNotFoundError = error instanceof Error && error.message.toLowerCase().includes('not found');
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isNotFoundError ? 404 : isDatabaseError ? 503 : 500;
        const message = isNotFoundError && error instanceof Error ? error.message : 'Internal server error';
        (0, apiResponse_1.sendError)(res, statusCode, { code: isNotFoundError ? 'NOT_FOUND' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR', message });
    }
};
exports.me = me;
const updateProfile = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req, res);
        if (!userId) {
            return;
        }
        const { displayName, avatarUrl } = req.body;
        const updatedProfile = await authService_1.AuthService.updateUserProfile(userId, { displayName, avatarUrl });
        (0, apiResponse_1.sendSuccess)(res, { user: updatedProfile });
    }
    catch (error) {
        (0, logger_1.logError)('Update profile failed', error, { userId: req.userId });
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isDatabaseError ? 503 : 500;
        (0, apiResponse_1.sendError)(res, statusCode, { code: isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.updateProfile = updateProfile;
const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;
        const result = await authService_1.AuthService.requestPasswordReset(email);
        (0, apiResponse_1.sendSuccess)(res, {
            message: 'Password reset code sent. Please check your inbox.',
            expiresIn: result.expiresIn,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Request password reset failed', error, { email: req.body.email });
        const isBusinessError = error instanceof Error &&
            (error.message.toLowerCase().includes('unable to send') || error.message.toLowerCase().includes('email'));
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isBusinessError ? 400 : isDatabaseError ? 503 : 500;
        const message = isBusinessError && error instanceof Error ? error.message : 'Internal server error';
        (0, apiResponse_1.sendError)(res, statusCode, {
            code: isBusinessError ? 'BUSINESS_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
            message,
        });
    }
};
exports.requestPasswordReset = requestPasswordReset;
const resetPassword = async (req, res) => {
    try {
        const { email, resetCode, srpSalt, srpVerifier, encryptedDataKey, kekSalt, preserveData } = req.body;
        const result = await authService_1.AuthService.resetPassword(email, resetCode, srpSalt, srpVerifier, encryptedDataKey, kekSalt, preserveData);
        (0, apiResponse_1.sendSuccess)(res, result);
    }
    catch (error) {
        (0, logger_1.logError)('Reset password failed', error);
        // 驗證錯誤回傳 400，資料庫錯誤回傳 503，其他錯誤回傳 500
        const isValidationError = error instanceof Error &&
            (error.message.toLowerCase().includes('code') || error.message.toLowerCase().includes('expired') ||
                error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('password') ||
                error.message.toLowerCase().includes('missing') || error.message.toLowerCase().includes('not found'));
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isValidationError ? 400 : isDatabaseError ? 503 : 500;
        const message = isValidationError && error instanceof Error ? error.message : 'Internal server error';
        (0, apiResponse_1.sendError)(res, statusCode, {
            code: isValidationError ? 'VALIDATION_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
            message,
        });
    }
};
exports.resetPassword = resetPassword;
/**
 * 登出 - 清除 Cookie（網頁客戶端）
 */
const logout = async (req, res) => {
    try {
        // 清除登入 Cookie
        res.clearCookie('authToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
        });
        (0, apiResponse_1.sendSuccess)(res, { message: 'Logged out successfully' });
    }
    catch (error) {
        (0, logger_1.logError)('Logout failed', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Logout failed' });
    }
};
exports.logout = logout;
const deleteAccount = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req, res);
        if (!userId) {
            return;
        }
        const result = await authService_1.AuthService.deleteAccount(userId);
        (0, apiResponse_1.sendSuccess)(res, result);
    }
    catch (error) {
        (0, logger_1.logError)('Delete account failed', error, { userId: req.userId });
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isDatabaseError ? 503 : 500;
        const message = 'Internal server error';
        (0, apiResponse_1.sendError)(res, statusCode, { code: isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR', message });
    }
};
exports.deleteAccount = deleteAccount;
/**
 * 專用頭像修改介面 - 接收 Base64 編碼圖片
 */
const updateAvatar = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req, res);
        if (!userId) {
            return;
        }
        const { avatar } = req.body;
        const updatedProfile = await authService_1.AuthService.updateUserProfile(userId, { avatarBase64: avatar });
        (0, apiResponse_1.sendSuccess)(res, {
            message: 'Avatar updated successfully',
            user: updatedProfile
        });
    }
    catch (error) {
        (0, logger_1.logError)('Update avatar failed', error, { userId: req.userId });
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isDatabaseError ? 503 : 500;
        (0, apiResponse_1.sendError)(res, statusCode, { code: isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.updateAvatar = updateAvatar;
/**
 * 修改顯示名稱 API
 */
const updateDisplayName = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req, res);
        if (!userId) {
            return;
        }
        const { displayName } = req.body;
        const updatedProfile = await authService_1.AuthService.updateUserProfile(userId, { displayName });
        (0, apiResponse_1.sendSuccess)(res, {
            message: 'Display name updated successfully',
            user: updatedProfile
        });
    }
    catch (error) {
        (0, logger_1.logError)('Update display name failed', error, { userId: req.userId });
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isDatabaseError ? 503 : 500;
        (0, apiResponse_1.sendError)(res, statusCode, { code: isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.updateDisplayName = updateDisplayName;
const sendVerificationCode = async (req, res) => {
    try {
        const { email } = req.body;
        const result = await authService_1.AuthService.sendVerificationCode(email, 'register');
        (0, apiResponse_1.sendSuccess)(res, {
            message: 'Verification code sent to your email',
            expiresIn: result.expiresIn,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Send verification code failed', error, { email: req.body.email });
        // 業務錯誤回傳具體訊息，資料庫錯誤回傳 503，其他錯誤回傳 500
        const isBusinessError = error instanceof Error &&
            (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('email') ||
                error.message.toLowerCase().includes('unable to send'));
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isBusinessError ? 400 : isDatabaseError ? 503 : 500;
        const message = isBusinessError && error instanceof Error ? error.message : 'Internal server error';
        (0, apiResponse_1.sendError)(res, statusCode, {
            code: isBusinessError ? 'BUSINESS_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
            message,
        });
    }
};
exports.sendVerificationCode = sendVerificationCode;
/**
 * 驗證郵箱驗證碼並完成註冊 (新註冊流程第二步)
 */
const verifyEmailAndRegister = async (req, res) => {
    try {
        const { email, verificationCode, srpSalt, srpVerifier, encryptedDataKey, kekSalt } = req.body;
        const clientType = (req.headers['x-client-type'] || 'web');
        const result = await authService_1.AuthService.verifyEmailAndRegister(email, verificationCode, {
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
            (0, apiResponse_1.sendSuccess)(res, { message: 'Registration successful', user: result.user });
        }
        else {
            // 行動客戶端：回傳 JWT 權杖
            (0, apiResponse_1.sendSuccess)(res, result);
        }
    }
    catch (error) {
        (0, logger_1.logError)('Verify email and register failed', error, { email: req.body.email });
        // 驗證錯誤回傳 400，資料庫錯誤回傳 503，其他錯誤回傳 500
        const isValidationError = error instanceof Error &&
            (error.message.toLowerCase().includes('registration') || error.message.toLowerCase().includes('verification') ||
                error.message.toLowerCase().includes('srp') || error.message.toLowerCase().includes('expired') ||
                error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('missing'));
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isValidationError ? 400 : isDatabaseError ? 503 : 500;
        const message = isValidationError && error instanceof Error ? error.message : 'Internal server error';
        (0, apiResponse_1.sendError)(res, statusCode, {
            code: isValidationError ? 'VALIDATION_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
            message,
        });
    }
};
exports.verifyEmailAndRegister = verifyEmailAndRegister;
/**
 * 請求修改郵箱 - 發送驗證碼到新郵箱
 */
const requestEmailChange = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req, res);
        if (!userId) {
            return;
        }
        const { newEmail } = req.body;
        const result = await authService_1.AuthService.requestEmailChange(userId, newEmail);
        (0, apiResponse_1.sendSuccess)(res, {
            message: 'Verification code sent to your new email. Please check your inbox.',
            expiresIn: result.expiresIn,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Request email change failed', error, { userId: req.userId });
        const isBusinessError = error instanceof Error &&
            (error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('already') ||
                error.message.toLowerCase().includes('unable to send'));
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isBusinessError ? 400 : isDatabaseError ? 503 : 500;
        const message = isBusinessError && error instanceof Error ? error.message : 'Internal server error';
        (0, apiResponse_1.sendError)(res, statusCode, {
            code: isBusinessError ? 'BUSINESS_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
            message,
        });
    }
};
exports.requestEmailChange = requestEmailChange;
/**
 * 確認修改郵箱 - 驗證碼驗證成功則修改郵箱
 */
const confirmEmailChange = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req, res);
        if (!userId) {
            return;
        }
        const { newEmail, code } = req.body;
        const result = await authService_1.AuthService.confirmEmailChange(userId, newEmail, code);
        (0, apiResponse_1.sendSuccess)(res, result);
    }
    catch (error) {
        (0, logger_1.logError)('Confirm email change failed', error, { userId: req.userId });
        const isValidationError = error instanceof Error &&
            (error.message.toLowerCase().includes('verification') || error.message.toLowerCase().includes('expired') ||
                error.message.toLowerCase().includes('pending') || error.message.toLowerCase().includes('invalid') ||
                error.message.toLowerCase().includes('missing'));
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isValidationError ? 400 : isDatabaseError ? 503 : 500;
        const message = isValidationError && error instanceof Error ? error.message : 'Internal server error';
        (0, apiResponse_1.sendError)(res, statusCode, {
            code: isValidationError ? 'VALIDATION_ERROR' : isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
            message,
        });
    }
};
exports.confirmEmailChange = confirmEmailChange;
//# sourceMappingURL=authController.js.map