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

// ── On-ramp（入金）：Virtual Accounts ────────────────────────────────
// POST /onramp：取得 / 建立專屬法幣入金帳戶（持久、免 memo）
// GET  /onramp：列出使用者的入金帳戶
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

// ── Off-ramp（出金）：Payout Liquidation Address（Base USDC → 法幣）────
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

// ── Crypto 入金：Liquidation Address（Tron USDT → Base USDC，永久地址）────
router.post(
  '/crypto-deposit-address',
  requireAuth,
  validateRequest({ body: createCryptoDepositAddressBodySchema }),
  wrapAsync(getOrCreateCryptoDepositAddress),
);
router.get('/crypto-deposit-address', requireAuth, wrapAsync(listCryptoDepositAddresses));

// ── External Accounts（off-ramp 出金銀行）──────────────────────────
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

// ── Webhook（無需 auth，靠簽章驗證）─────────────────────────────────
router.post('/webhook', wrapAsync(handleBridgeWebhook));

export default router;
