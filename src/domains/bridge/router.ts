import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import { appLogger } from '../logger';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  createExternalAccount,
  createKycLink,
  createOffRamp,
  createOnRamp,
  getCustomerStatus,
  getTransfer,
  handleBridgeWebhook,
  listDeposits,
  listExternalAccounts,
  listTransfers,
  listVirtualAccounts,
} from './controllers/bridgeController';
import {
  createExternalAccountBodySchema,
  createKycLinkBodySchema,
  createOffRampBodySchema,
  createOnRampBodySchema,
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
  validateRequest({ params: virtualAccountIdParamSchema }),
  wrapAsync(listDeposits),
);
// 使用者所有入金紀錄（跨 VA）
router.get('/deposits', requireAuth, wrapAsync(listDeposits));

// ── Off-ramp（出金）───────────────────────────────────────────────────
router.post(
  '/offramp',
  requireAuth,
  validateRequest({ body: createOffRampBodySchema }),
  wrapAsync(createOffRamp),
);
router.get('/transfers', requireAuth, wrapAsync(listTransfers));
router.get(
  '/transfers/:transferId',
  requireAuth,
  validateRequest({ params: transferIdParamSchema }),
  wrapAsync(getTransfer),
);

// ── External Accounts（off-ramp 出金銀行）──────────────────────────
router.post(
  '/external-accounts',
  requireAuth,
  validateRequest({ body: createExternalAccountBodySchema }),
  wrapAsync(createExternalAccount),
);
router.get('/external-accounts', requireAuth, wrapAsync(listExternalAccounts));

// ── Webhook（無需 auth，靠簽章驗證）─────────────────────────────────
router.post('/webhook', wrapAsync(handleBridgeWebhook));

export default router;
