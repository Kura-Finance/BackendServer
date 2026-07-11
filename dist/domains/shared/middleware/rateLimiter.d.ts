import { Request, Response, NextFunction } from 'express';
export interface RateLimiterConfig {
    windowMs?: number;
    maxRequests?: number;
}
/**
 * 創建速率限制中間件
 * @param config 配置選項
 * @returns Express 中間件函數
 */
export declare function createRateLimiter(config?: RateLimiterConfig): (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
/**
 * 默認的速率限制中間件
 * 15 分鐘內最多 100 次請求
 */
export declare const rateLimiter: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
/**
 * 認證相關速率限制（用於註冊、登入、密碼重置等）
 * 15 分鐘內最多 50 次請求 - 允許用戶多次重試
 */
export declare const authRateLimiter: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
/**
 * 嚴格的速率限制（用於 API 端點）
 * 5 分鐘內最多 20 次請求 - 用於防止數據挖掘
 */
export declare const strictRateLimiter: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
/**
 * 寬鬆的速率限制（用於健康檢查等）
 * 1 分鐘內最多 100 次請求
 */
export declare const lenientRateLimiter: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
//# sourceMappingURL=rateLimiter.d.ts.map