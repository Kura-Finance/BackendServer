"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lenientRateLimiter = exports.strictRateLimiter = exports.authRateLimiter = exports.rateLimiter = void 0;
exports.createRateLimiter = createRateLimiter;
const store = {};
/**
 * 創建速率限制中間件
 * @param config 配置選項
 * @returns Express 中間件函數
 */
function createRateLimiter(config = {}) {
    const windowMs = config.windowMs || 15 * 60 * 1000; // 預設 15 分鐘
    const maxRequests = config.maxRequests || 100; // 預設 100 次請求
    return (req, res, next) => {
        // 取得客戶端 IP 位址
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        // 初始化或重設此 IP 的存取紀錄
        if (!store[ip] || now > store[ip].resetTime) {
            store[ip] = {
                count: 1,
                resetTime: now + windowMs,
            };
            return next();
        }
        // 增加計數
        store[ip].count++;
        // 設定 RateLimit 相關標頭
        res.setHeader('RateLimit-Limit', maxRequests.toString());
        res.setHeader('RateLimit-Remaining', Math.max(0, (maxRequests - store[ip].count)).toString());
        res.setHeader('RateLimit-Reset', new Date(store[ip].resetTime).toISOString());
        // 檢查是否超過限制
        if (store[ip].count > maxRequests) {
            return res.status(429).json({
                error: 'Too Many Requests',
                message: 'Too many requests. Please try again later.',
                retryAfter: Math.ceil((store[ip].resetTime - now) / 1000),
            });
        }
        next();
    };
}
/**
 * 默認的速率限制中間件
 * 15 分鐘內最多 100 次請求
 */
exports.rateLimiter = createRateLimiter();
/**
 * 認證相關速率限制（用於註冊、登入、密碼重置等）
 * 15 分鐘內最多 50 次請求 - 允許用戶多次重試
 */
exports.authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 50,
});
/**
 * 嚴格的速率限制（用於 API 端點）
 * 5 分鐘內最多 20 次請求 - 用於防止數據挖掘
 */
exports.strictRateLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000,
    maxRequests: 20,
});
/**
 * 寬鬆的速率限制（用於健康檢查等）
 * 1 分鐘內最多 100 次請求
 */
exports.lenientRateLimiter = createRateLimiter({
    windowMs: 1 * 60 * 1000,
    maxRequests: 100,
});
//# sourceMappingURL=rateLimiter.js.map