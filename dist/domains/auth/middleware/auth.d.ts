import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    userId?: string;
    clientType?: 'web' | 'mobile';
}
/**
 * 從 Cookie 或 Authorization 解析 JWT，寫入 req.userId / req.clientType。
 * @returns 是否成功解析有效 token
 */
export declare function resolveRequestAuth(req: AuthRequest): boolean;
/**
 * 認證中間件 - 支援兩種認證方式:
 * 1. 網頁端：Cookie 中的 authToken (HttpOnly)
 * 2. 行動端：Authorization 標頭中的 Bearer Token
 */
export declare const requireAuth: (req: AuthRequest, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map