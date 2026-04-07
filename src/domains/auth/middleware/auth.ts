import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { appLogger } from '../../logger';

export interface AuthRequest extends Request {
  userId?: string;
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    appLogger.warn('Missing authorization token', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    res.status(401).json({ error: '未提供授權 Token' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };
    req.userId = decoded.userId; // 將解析出的 userId 塞入 request
    appLogger.debug('Token verified successfully', { userId: decoded.userId });
    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    appLogger.warn('Token verification failed', {
      error: errorMessage,
      path: req.path,
      ip: req.ip,
    });
    res.status(401).json({ error: 'Token 無效或已過期' });
  }
};
