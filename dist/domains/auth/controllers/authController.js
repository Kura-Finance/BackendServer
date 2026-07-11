"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyCashbackHistory = exports.applyReferralCode = exports.updateDisplayName = exports.updateAvatar = exports.deleteAccount = exports.logout = exports.updateProfile = exports.me = void 0;
const authService_1 = require("../services/authService");
const logger_1 = require("../../logger");
const library_1 = require("@prisma/client/runtime/library");
const apiResponse_1 = require("../../shared/lib/apiResponse");
/**
 * 認證控制器 - 請求與回應處理
 *
 * 登入流程改由 Privy 驅動（見 privyController），此控制器只負責登入後的
 * 個人資料、登出、邀請碼、返現紀錄與帳號刪除。
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
const applyReferralCode = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req, res);
        if (!userId) {
            return;
        }
        const { referralCode } = req.body;
        const user = await authService_1.AuthService.applyReferralCode(userId, referralCode);
        (0, apiResponse_1.sendSuccess)(res, {
            message: 'Referral code applied successfully',
            user,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Apply referral code failed', error, { userId: req.userId });
        const message = error instanceof Error ? error.message : 'Failed to apply referral code';
        const normalized = message.toLowerCase();
        const isValidationError = normalized.includes('invalid') ||
            normalized.includes('already') ||
            normalized.includes('cannot use your own');
        const statusCode = isValidationError ? 400 : 500;
        (0, apiResponse_1.sendError)(res, statusCode, {
            code: isValidationError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
            message,
        });
    }
};
exports.applyReferralCode = applyReferralCode;
const getMyCashbackHistory = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req, res);
        if (!userId) {
            return;
        }
        const status = req.query.status;
        const limit = Number(req.query.limit) || 50;
        const result = await authService_1.AuthService.getReferralCashbackHistory(userId, {
            limit,
            ...(status ? { status } : {}),
        });
        (0, apiResponse_1.sendSuccess)(res, result);
    }
    catch (error) {
        (0, logger_1.logError)('Get cashback history failed', error, { userId: req.userId });
        const isDatabaseError = error instanceof library_1.PrismaClientKnownRequestError;
        const statusCode = isDatabaseError ? 503 : 500;
        (0, apiResponse_1.sendError)(res, statusCode, {
            code: isDatabaseError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
};
exports.getMyCashbackHistory = getMyCashbackHistory;
//# sourceMappingURL=authController.js.map