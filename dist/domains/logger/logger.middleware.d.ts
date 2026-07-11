import { Request, Response, NextFunction } from 'express';
/**
 * HTTP 日志中间件
 * 记录所有请求和响应
 */
export declare const httpLogger: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 请求体日志中间件（用于调试）
 */
export declare const requestBodyLogger: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 错误日志中间件
 */
export declare const errorLogger: (err: Error, req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=logger.middleware.d.ts.map