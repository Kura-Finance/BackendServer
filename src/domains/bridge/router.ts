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
  listExternalAccounts,
  listTransfers,
} from './controllers/bridgeController';
import {
  createExternalAccountBodySchema,
  createKycLinkBodySchema,
  createOffRampBodySchema,
  createOnRampBodySchema,
  transferIdParamSchema,
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

// ── On / Off Ramp ───────────────────────────────────────────────────
router.post(
  '/onramp',
  requireAuth,
  validateRequest({ body: createOnRampBodySchema }),
  wrapAsync(createOnRamp),
);
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
