/**
 * Bridge HTTP routes (mounted at /api/bridge).
 * Auth required except webhook (signature-verified).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import { appLogger } from '../logger';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  createExternalAccount,
  deleteExternalAccount,
  createEndorsementLink,
  getOrCreateCryptoDepositAddress,
  listCryptoDepositAddresses,
  createKycLink,
  getOrCreatePayoutAddress,
  listPayoutAddresses,
  listPayoutDrains,
  createOnRamp,
  getCustomerStatus,
  getTransfer,
  handleBridgeWebhook,
  listDeposits,
  listExternalAccounts,
  listPayoutOptions,
  listTransfers,
  listVirtualAccounts,
} from './controllers/bridgeController';
import {
  createExternalAccountBodySchema,
  externalAccountIdParamSchema,
  createEndorsementLinkBodySchema,
  createCryptoDepositAddressBodySchema,
  createKycLinkBodySchema,
  createPayoutAddressBodySchema,
  createOnRampBodySchema,
  liquidationAddressIdParamSchema,
  bridgeDepositsQuerySchema,
  transferIdParamSchema,
  virtualAccountIdParamSchema,
} from './schemas/bridgeSchemas';

const router = Router();

const wrapAsync = (fn: (req: any, res: Response, next?: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      appLogger.error('Bridge router error', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  };
};

// ── Customer / KYC ──────────────────────────────────────────────────
router.post(
  '/kyc-link',
  requireAuth,
  validateRequest({ body: createKycLinkBodySchema }),
  wrapAsync(createKycLink),
);
router.post(
  '/endorsement-link',
  requireAuth,
  validateRequest({ body: createEndorsementLinkBodySchema }),
  wrapAsync(createEndorsementLink),
);
router.get('/customer', requireAuth, wrapAsync(getCustomerStatus));

// ── On-ramp (fiat → crypto): Virtual Accounts ─────────────────────────
// POST /onramp — get or create a persistent fiat deposit VA (no memo)
// GET  /onramp — list the user's virtual accounts
router.post(
  '/onramp',
  requireAuth,
  validateRequest({ body: createOnRampBodySchema }),
  wrapAsync(createOnRamp),
);
router.get('/onramp', requireAuth, wrapAsync(listVirtualAccounts));
router.get(
  '/onramp/:virtualAccountId/deposits',
  requireAuth,
  validateRequest({ params: virtualAccountIdParamSchema, query: bridgeDepositsQuerySchema }),
  wrapAsync(listDeposits),
);
router.get(
  '/deposits',
  requireAuth,
  validateRequest({ query: bridgeDepositsQuerySchema }),
  wrapAsync(listDeposits),
);

// ── Off-ramp: Payout Liquidation Address (Base USDC → fiat) ───────────
router.get('/payout-options', requireAuth, wrapAsync(listPayoutOptions));
router.post(
  '/payout-address',
  requireAuth,
  validateRequest({ body: createPayoutAddressBodySchema }),
  wrapAsync(getOrCreatePayoutAddress),
);
router.get('/payout-address', requireAuth, wrapAsync(listPayoutAddresses));
router.get(
  '/payout-address/:liquidationAddressId/drains',
  requireAuth,
  validateRequest({ params: liquidationAddressIdParamSchema }),
  wrapAsync(listPayoutDrains),
);
router.get('/transfers', requireAuth, wrapAsync(listTransfers));
router.get(
  '/transfers/:transferId',
  requireAuth,
  validateRequest({ params: transferIdParamSchema }),
  wrapAsync(getTransfer),
);

// ── Crypto deposit: Liquidation Address (Tron USDT → Base USDC) ───────
router.post(
  '/crypto-deposit-address',
  requireAuth,
  validateRequest({ body: createCryptoDepositAddressBodySchema }),
  wrapAsync(getOrCreateCryptoDepositAddress),
);
router.get('/crypto-deposit-address', requireAuth, wrapAsync(listCryptoDepositAddresses));

// ── External Accounts (off-ramp bank accounts) ────────────────────────
router.post(
  '/external-accounts',
  requireAuth,
  validateRequest({ body: createExternalAccountBodySchema }),
  wrapAsync(createExternalAccount),
);
router.get('/external-accounts', requireAuth, wrapAsync(listExternalAccounts));
router.delete(
  '/external-accounts/:externalAccountId',
  requireAuth,
  validateRequest({ params: externalAccountIdParamSchema }),
  wrapAsync(deleteExternalAccount),
);

// ── Webhook (no auth; signature verification) ─────────────────────────
router.post('/webhook', wrapAsync(handleBridgeWebhook));

export default router;
