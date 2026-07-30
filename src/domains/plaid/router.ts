/**
 * Plaid routes — Link, encrypted finance snapshots, disconnect, cache info, webhooks.
 */
import { Router, Request, Response, NextFunction } from 'express';
import {
  createLinkToken,
  exchangePublicToken,
  disconnectPlaidItem,
  getFinanceSnapshotOptimized,
  getEncryptedFinanceSnapshot,
  getCacheInfo,
  handlePlaidWebhook,
} from './controllers/plaidController';
import { requireAuth } from '../auth/middleware/auth';
import { appLogger } from '../logger';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  disconnectPlaidItemBodySchema,
  exchangePublicTokenBodySchema,
  getFinanceSnapshotQuerySchema,
} from './schemas/plaidSchemas';

const router = Router();

/** Catch async handler errors and return 500. */
const wrapAsync = (fn: (req: any, res: Response, next?: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      appLogger.error('Plaid router error', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  };
};

/** POST /api/plaid/create-link-token — create Plaid Link token (auth required). */
router.post('/create-link-token', requireAuth, wrapAsync(createLinkToken));

/**
 * POST /api/plaid/exchange-public-token — exchange public token for access token.
 * Body: { public_token: string, institution_name?: string }
 */
router.post(
  '/exchange-public-token',
  requireAuth,
  validateRequest({ body: exchangePublicTokenBodySchema }),
  wrapAsync(exchangePublicToken),
);

/**
 * GET /api/plaid/finance-snapshot — finance snapshot (accounts, transactions, investments).
 * Uses cache by default; `?refresh=true` forces a manual refresh (daily limits apply).
 *
 * Limits: auto-load on first link / cache expiry is unlimited; manual refresh is capped
 * by subscription tier.
 *
 * Response includes `_cacheSource` hint. 429 only on manual refresh when daily limit hit.
 */
router.get(
  '/finance-snapshot',
  requireAuth,
  validateRequest({ query: getFinanceSnapshotQuerySchema }),
  wrapAsync(getFinanceSnapshotOptimized),
);

/**
 * GET /api/plaid/finance-snapshot/encrypted — encrypted finance snapshot (Phase 3 E2EE).
 *
 * Backend does not decrypt. Returns payloadKeys (wrappedSek per sync batch) plus
 * metadata + payloadCiphertext rows. Client must set up X25519 keypair first.
 *
 * - No keypair + existing encrypted cache → return stale cache
 * - No keypair + empty cache → 409 KEY_PAIR_REQUIRED
 * - Keypair present → encrypt on write and return latest encrypted snapshot
 */
router.get(
  '/finance-snapshot/encrypted',
  requireAuth,
  wrapAsync(getEncryptedFinanceSnapshot),
);

/**
 * POST /api/plaid/disconnect-item — disconnect Plaid Item (all accounts under it).
 * Body: { accountId: string }
 */
router.post(
  '/disconnect-item',
  requireAuth,
  validateRequest({ body: disconnectPlaidItemBodySchema }),
  wrapAsync(disconnectPlaidItem),
);

/** GET /api/plaid/cache/info — cache stats and sync timestamps (auth required). */
router.get('/cache/info', requireAuth, wrapAsync(getCacheInfo));

/**
 * POST /api/plaid/webhook — Plaid webhook ingress (no auth; called by Plaid).
 * Types: ITEM, TRANSACTIONS, INVESTMENTS_TRANSACTIONS, AUTH.
 */
router.post('/webhook', wrapAsync(handlePlaidWebhook));

export default router;
