"use strict";
/**
 * SRP 控制器
 * 處理 SRP 零知識認證的 HTTP 請求
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.srpGenerateDataKeyDisabled = exports.srpDataKey = exports.srpSetup = exports.srpVerify = exports.srpChallenge = exports.srpGetSalt = void 0;
const jwt = __importStar(require("jsonwebtoken"));
const srpService_1 = require("../services/srpService");
const authService_1 = require("../services/authService");
const logger_1 = require("../../logger");
const apiResponse_1 = require("../../shared/lib/apiResponse");
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
// Cookie 設定（與現有認證控制器保持一致）
function setAuthCookie(res, token) {
    res.cookie('authToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
    });
}
function getAuthenticatedUserId(req, res) {
    if (!req.userId) {
        (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
        return null;
    }
    return req.userId;
}
/**
 * POST /api/auth/srp/salt
 * 取得使用者的 salt（不需要認證，salt 本身是公開的）
 * 用戶端使用 salt + 密碼推導 Master Key
 */
const srpGetSalt = async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = email.toLowerCase().trim();
        const salts = await srpService_1.SRPService.getSaltForEmail(normalizedEmail);
        if (!salts) {
            // 帳號不存在或尚未升級 SRP；回傳穩定的假 salt 與 srpEnabled: false
            // 前端看到 srpEnabled: false 應引導註冊/重設，不再走舊版密碼登入流程
            (0, apiResponse_1.sendSuccess)(res, {
                srpSalt: srpService_1.SRPService.generateStableFakeSalt(normalizedEmail, 'srp'),
                kekSalt: srpService_1.SRPService.generateStableFakeSalt(normalizedEmail, 'kek'),
                srpEnabled: false,
            });
            return;
        }
        (0, apiResponse_1.sendSuccess)(res, salts); // salts 已含 srpEnabled: true
    }
    catch (error) {
        (0, logger_1.logError)('SRP get salt failed', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.srpGetSalt = srpGetSalt;
/**
 * POST /api/auth/srp/challenge
 * SRP 登入階段 1：用戶端傳入 A，伺服器回傳 B + salt
 */
const srpChallenge = async (req, res) => {
    try {
        const { email } = req.body;
        const result = await srpService_1.SRPService.srpChallenge(email.toLowerCase().trim());
        (0, apiResponse_1.sendSuccess)(res, result);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'Login failed';
        (0, logger_1.logError)('SRP challenge failed', error);
        (0, apiResponse_1.sendError)(res, 401, { code: 'AUTH_FAILED', message: msg });
    }
};
exports.srpChallenge = srpChallenge;
/**
 * POST /api/auth/srp/verify
 * SRP 登入階段 2：用戶端傳入 M1，伺服器驗證並回傳 M2 + JWT token
 */
const srpVerify = async (req, res) => {
    try {
        const { sessionId, clientA, clientM1 } = req.body;
        const { userId, serverM2 } = await srpService_1.SRPService.srpVerify(sessionId, clientA, clientM1);
        // 發行 JWT 權杖（與現有系統相容）
        const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
        setAuthCookie(res, token);
        const profile = await authService_1.AuthService.buildUserProfile(userId);
        (0, logger_1.logDebug)('SRP login successful', { userId });
        (0, apiResponse_1.sendSuccess)(res, {
            serverM2,
            token, // Mobile 客戶端用
            user: profile,
        });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'Verification failed';
        (0, logger_1.logError)('SRP verify failed', error);
        (0, apiResponse_1.sendError)(res, 401, { code: 'AUTH_FAILED', message: msg });
    }
};
exports.srpVerify = srpVerify;
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
const srpSetup = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req, res);
        if (!userId) {
            return;
        }
        const { srpSalt, srpVerifier, encryptedDataKey, kekSalt } = req.body;
        await srpService_1.SRPService.storeVerifier(userId, srpSalt, srpVerifier, encryptedDataKey, kekSalt);
        (0, logger_1.logDebug)('SRP setup completed', { userId });
        (0, apiResponse_1.sendSuccess)(res, { message: 'SRP authentication enabled' });
    }
    catch (error) {
        (0, logger_1.logError)('SRP setup failed', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.srpSetup = srpSetup;
/**
 * GET /api/auth/srp/data-key
 * 取得已登入使用者的加密 Data Key
 * 用戶端使用 KEK 解密後使用
 */
const srpDataKey = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req, res);
        if (!userId) {
            return;
        }
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../../shared/lib/prisma')));
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { encryptedDataKey: true, kekSalt: true },
        });
        if (!user?.encryptedDataKey) {
            (0, apiResponse_1.sendError)(res, 404, { code: 'NOT_FOUND', message: 'SRP is not configured yet. Complete setup first.' });
            return;
        }
        (0, apiResponse_1.sendSuccess)(res, {
            encryptedDataKey: user.encryptedDataKey,
            kekSalt: user.kekSalt,
        });
    }
    catch (error) {
        (0, logger_1.logError)('SRP data key fetch failed', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.srpDataKey = srpDataKey;
/**
 * POST /api/auth/srp/generate-data-key
 * 停用：Zero Access/Zero Knowledge 模式下，DEK 必須由用戶端本地生成。
 */
const srpGenerateDataKeyDisabled = async (_req, res) => {
    (0, apiResponse_1.sendError)(res, 410, {
        code: 'GONE',
        message: 'Endpoint disabled. Generate data key on client and upload only encryptedDataKey via /srp/setup or /register/verify.',
    });
};
exports.srpGenerateDataKeyDisabled = srpGenerateDataKeyDisabled;
//# sourceMappingURL=srpController.js.map