"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const logger_1 = require("../../logger");
const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        logger_1.appLogger.warn('Missing authorization token', {
            path: req.path,
            method: req.method,
            ip: req.ip,
        });
        res.status(401).json({ error: '未提供授權 Token' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId; // 將解析出的 userId 塞入 request
        logger_1.appLogger.debug('Token verified successfully', { userId: decoded.userId });
        next();
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.appLogger.warn('Token verification failed', {
            error: errorMessage,
            path: req.path,
            ip: req.ip,
        });
        res.status(401).json({ error: 'Token 無效或已過期' });
    }
};
exports.requireAuth = requireAuth;
//# sourceMappingURL=auth.js.map