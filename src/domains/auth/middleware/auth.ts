import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { appLogger } from '../../logger';

export interface AuthRequest extends Request {
  userId?: string;
  clientType?: 'web' | 'mobile'; // web 使用 Cookie 認證，mobile 使用 JWT
}

/**
 * 認證中間件 - 支援兩種認證方式:
 * 1. 網頁端：Cookie 中的 authToken (HttpOnly)
 * 2. 行動端：Authorization 標頭中的 Bearer Token
 */
export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  let token: string | undefined;
  
  // 優先嘗試從 Authorization 標頭讀取（行動端 JWT）
  token = req.headers.authorization?.split(' ')[1];
  
  // 如果沒有，再嘗試從 Cookie 讀取（網頁端 Cookie）
  if (!token && req.cookies?.authToken) {
    token = req.cookies.authToken;
    req.clientType = 'web';
  }
  
  if (!token) {
    appLogger.warn('Missing authorization token', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    res.status(401).json({ error: 'Authorization token not provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };
    req.userId = decoded.userId; // 將解析出的 userId 塞入 request
    appLogger.debug('Token verified successfully', { userId: decoded.userId, clientType: req.clientType });
    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    appLogger.warn('Token verification failed', {
      error: errorMessage,
      path: req.path,
      ip: req.ip,
    });
    res.status(401).json({ error: 'Token is invalid or expired' });
  }
};
