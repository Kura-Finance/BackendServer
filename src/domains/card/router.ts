import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import { validateRequest } from '../shared/middleware/validateRequest';
import { appLogger } from '../logger';

// ── Controllers ───────────────────────────────────────────────────────────────
import {
  getCardStatus,
  listCards,
  createVirtualCard,
  freezeCard,
  unfreezeCard,
  getTransactions,
} from './controllers/cardController';

import {
  getNonce,
  authenticate,
  signUp,
  getTerms,
  acceptTerms,
  getGpStatus,
} from './controllers/gpAuthController';

import {
  getKycWebUrl,
  getKycSdkToken,
  getSofQuestions,
  submitSourceOfFunds,
  sendPhoneOtp,
  verifyPhoneOtp,
} from './controllers/gpKycController';

import { deploySafe, getSafeDeployStatus, getSafeStatus } from './controllers/gpSafeController';
import { getPseToken } from './controllers/gpPseController';
import { handleGnosisPayWebhook } from './controllers/webhookController';

// ── Schemas ───────────────────────────────────────────────────────────────────
import {
  gpAuthBodySchema,
  gpSignUpBodySchema,
  gpSofBodySchema,
  gpPhoneSendBodySchema,
  gpPhoneVerifyBodySchema,
} from './schemas/cardSchemas';

const router = Router();

const wrapAsync = (fn: (req: any, res: Response, next?: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error: unknown) => {
      appLogger.error('Card router error', error);
      next(error);
    });
  };

// ── Card status + transactions ────────────────────────────────────────────────
router.get('/status', requireAuth, wrapAsync(getCardStatus));
router.get('/cards', requireAuth, wrapAsync(listCards));
router.get('/transactions', requireAuth, wrapAsync(getTransactions));

// ── Card management ───────────────────────────────────────────────────────────
router.post('/cards/virtual', requireAuth, wrapAsync(createVirtualCard));
router.patch('/cards/:cardId/freeze', requireAuth, wrapAsync(freezeCard));
router.patch('/cards/:cardId/unfreeze', requireAuth, wrapAsync(unfreezeCard));

// ── Gnosis Pay SIWE auth ──────────────────────────────────────────────────────
router.get('/gp/nonce', requireAuth, wrapAsync(getNonce));
router.post(
  '/gp/auth',
  requireAuth,
  validateRequest({ body: gpAuthBodySchema }),
  wrapAsync(authenticate),
);
router.post(
  '/gp/signup',
  requireAuth,
  validateRequest({ body: gpSignUpBodySchema }),
  wrapAsync(signUp),
);
router.get('/gp/terms', requireAuth, wrapAsync(getTerms));
router.post('/gp/terms', requireAuth, wrapAsync(acceptTerms));
router.get('/gp/status', requireAuth, wrapAsync(getGpStatus));

// ── Gnosis Pay KYC (Sumsub) ───────────────────────────────────────────────────
router.get('/gp/kyc/url', requireAuth, wrapAsync(getKycWebUrl));
router.get('/gp/kyc/sdk-token', requireAuth, wrapAsync(getKycSdkToken));
router.get('/gp/sof', requireAuth, wrapAsync(getSofQuestions));
router.post('/gp/sof', requireAuth, wrapAsync(submitSourceOfFunds));

// ── Phone verification ────────────────────────────────────────────────────────
router.post(
  '/gp/phone/send',
  requireAuth,
  validateRequest({ body: gpPhoneSendBodySchema }),
  wrapAsync(sendPhoneOtp),
);
router.post(
  '/gp/phone/verify',
  requireAuth,
  validateRequest({ body: gpPhoneVerifyBodySchema }),
  wrapAsync(verifyPhoneOtp),
);

// ── Safe deployment ───────────────────────────────────────────────────────────
router.post('/gp/safe/deploy', requireAuth, wrapAsync(deploySafe));
router.get('/gp/safe/deploy', requireAuth, wrapAsync(getSafeDeployStatus));
router.get('/gp/safe/status', requireAuth, wrapAsync(getSafeStatus));

// ── PSE (sensitive card data: PAN, CVV, PIN) ──────────────────────────────────
// Requires PSE mTLS cert configured (GNOSIS_PAY_PSE_*); returns 503 otherwise
router.get('/gp/pse/token', requireAuth, wrapAsync(getPseToken));

// ── Gnosis Pay Webhook (Ed25519 verified) ─────────────────────────────────────
// Raw body is required for signature verification; use express.raw middleware in index.ts
router.post('/webhooks/gp', wrapAsync(handleGnosisPayWebhook));

export default router;
