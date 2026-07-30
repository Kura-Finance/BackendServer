/** DeBank HTTP routes for protocols, tokens, and address unlink. */

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
 * Async error wrapper for DeBank routes.
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
 * GET /api/debank/protocols — DeBank protocol positions for an address.
 * Auth required. Query: address=0x..., refresh=true (optional force refresh).
 */
router.get(
  '/protocols',
  requireAuth,
  validateRequest({ query: getProtocolsQuerySchema }),
  wrapAsync(getUserProtocolPositions),
);

/**
 * GET /api/debank/tokens — DeBank EVM token holdings for an address.
 * Auth required. Query: address=0x..., refresh=true (optional force refresh).
 */
router.get(
  '/tokens',
  requireAuth,
  validateRequest({ query: getProtocolsQuerySchema }),
  wrapAsync(getUserTokenPositions),
);

/**
 * DELETE /api/debank/addresses/:address — unlink address (clear its cache).
 * Auth required.
 */
router.delete(
  '/addresses/:address',
  requireAuth,
  validateRequest({ params: unlinkAddressParamsSchema }),
  wrapAsync(unlinkDeBankAddress),
);

export default router;
