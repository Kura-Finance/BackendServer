/** Exchange HTTP routes — supported catalog, connect, accounts, balances, disconnect. */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import * as ExchangeController from './controllers/exchangeController';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  connectExchangeBodySchema,
  exchangeAccountIdParamsSchema,
} from './schemas/exchangeSchemas';

const router = Router();

/**
 * GET /api/exchange/supported
 * Public static catalog of supported exchanges (no user data).
 *
 * Registered before requireAuth so the client can load the list during login
 * (e.g. ExchangeLinkModal before a token is attached).
 */
router.get('/supported', ExchangeController.getSupportedExchanges);

// All routes below require auth
router.use(requireAuth);

/**
 * POST /api/exchange/connect
 * Link a new exchange account.
 * Body: { exchange, apiKey, apiSecret, passphrase? }
 */
router.post('/connect', validateRequest({ body: connectExchangeBodySchema }), ExchangeController.connectExchange);

/**
 * GET /api/exchange/accounts
 * List the user's linked exchange accounts.
 */
router.get('/accounts', ExchangeController.getUserExchangeAccounts);

/**
 * GET /api/exchange/:exchangeAccountId/balances
 * Encrypted balances + assets for one account (Phase 3 Zero-Access E2EE only).
 * - Triggers CCXT sync → encrypt cache → reload encrypted rows
 * - On query limit: fall back to local encrypted cache
 * Returns: { account, payloadKeys[], balances[], assets[] }
 */
router.get(
  '/:exchangeAccountId/balances',
  validateRequest({ params: exchangeAccountIdParamsSchema }),
  ExchangeController.getExchangeBalances,
);

/**
 * DELETE /api/exchange/:exchangeAccountId
 * Disconnect an exchange account.
 */
router.delete(
  '/:exchangeAccountId',
  validateRequest({ params: exchangeAccountIdParamsSchema }),
  ExchangeController.disconnectExchange,
);

export default router;
