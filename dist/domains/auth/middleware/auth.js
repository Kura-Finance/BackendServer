"use strict";
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
exports.requireAuth = void 0;
exports.resolveRequestAuth = resolveRequestAuth;
const jwt = __importStar(require("jsonwebtoken"));
const logger_1 = require("../../logger");
const env_1 = require("../../../config/env");
function resolveClientType(req, opts) {
    const headerClient = req.headers['x-client-type']?.toLowerCase();
    if (opts.fromCookie) {
        req.clientType = 'web';
        return;
    }
    if (headerClient === 'web' || headerClient === 'mobile') {
        req.clientType = headerClient;
        return;
    }
    if (opts.hasBearer) {
        req.clientType = 'mobile';
    }
}
/**
 * 從 Cookie 或 Authorization 解析 JWT，寫入 req.userId / req.clientType。
 * @returns 是否成功解析有效 token
 */
function resolveRequestAuth(req) {
    if (req.userId) {
        return true;
    }
    let token = req.headers.authorization?.split(' ')[1];
    const fromCookie = !token && !!req.cookies?.authToken;
    if (fromCookie) {
        token = req.cookies.authToken;
    }
    resolveClientType(req, {
        fromCookie,
        hasBearer: !!req.headers.authorization?.startsWith('Bearer '),
    });
    if (!token) {
        return false;
    }
    try {
        const decoded = jwt.verify(token, (0, env_1.getJwtSecret)());
        req.userId = decoded.userId;
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 認證中間件 - 支援兩種認證方式:
 * 1. 網頁端：Cookie 中的 authToken (HttpOnly)
 * 2. 行動端：Authorization 標頭中的 Bearer Token
 */
const requireAuth = (req, res, next) => {
    if (req.userId) {
        logger_1.appLogger.debug('Token verified successfully', {
            userId: req.userId,
            clientType: req.clientType,
        });
        next();
        return;
    }
    let token = req.headers.authorization?.split(' ')[1];
    const fromCookie = !token && !!req.cookies?.authToken;
    if (fromCookie) {
        token = req.cookies.authToken;
    }
    if (!token) {
        logger_1.appLogger.warn('Missing authorization token', {
            path: req.path,
            method: req.method,
            ip: req.ip,
        });
        res.status(401).json({ error: 'Authorization token not provided' });
        return;
    }
    resolveClientType(req, {
        fromCookie,
        hasBearer: !!req.headers.authorization?.startsWith('Bearer '),
    });
    try {
        const decoded = jwt.verify(token, (0, env_1.getJwtSecret)());
        req.userId = decoded.userId;
        logger_1.appLogger.debug('Token verified successfully', {
            userId: req.userId,
            clientType: req.clientType,
        });
        next();
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.appLogger.warn('Token verification failed', {
            error: errorMessage,
            path: req.path,
            ip: req.ip,
        });
        res.status(401).json({ error: 'Token is invalid or expired' });
    }
};
exports.requireAuth = requireAuth;
//# sourceMappingURL=auth.js.map