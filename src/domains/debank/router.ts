import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import { appLogger } from '../logger';
import {
  getUserProtocolPositions,
  getUserTokenPositions,
  unlinkDeBankAddress,
} from './controllers/debankController';
import { validateRequest } from '../shared/middleware/validateRequest';
import { getProtocolsQuerySchema, unlinkAddressParamsSchema } from './schemas/debankSchemas';

const router = Router();

/**
 * DeBank 路由錯誤處理中介層
 */
const wrapAsync = (fn: (req: any, res: Response, next?: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      appLogger.error('DeBank router error', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  };
};

/**
 * 路由：GET /api/debank/protocols
 * 功能：取得指定地址的 DeBank 協議持倉資料
 * 驗證：需要登入
 * 查詢參數：address=0x...、refresh=true（可選，強制刷新）
 */
router.get(
  '/protocols',
  requireAuth,
  validateRequest({ query: getProtocolsQuerySchema }),
  wrapAsync(getUserProtocolPositions),
);

/**
 * 路由：GET /api/debank/tokens
 * 功能：取得指定地址的 DeBank EVM Token 持倉資料
 * 驗證：需要登入
 * 查詢參數：address=0x...、refresh=true（可選，強制刷新）
 */
router.get(
  '/tokens',
  requireAuth,
  validateRequest({ query: getProtocolsQuerySchema }),
  wrapAsync(getUserTokenPositions),
);

/**
 * 路由：DELETE /api/debank/addresses/:address
 * 功能：解除指定地址的 DeBank 連結（清除該地址快取）
 * 驗證：需要登入
 */
router.delete(
  '/addresses/:address',
  requireAuth,
  validateRequest({ params: unlinkAddressParamsSchema }),
  wrapAsync(unlinkDeBankAddress),
);

export default router;
