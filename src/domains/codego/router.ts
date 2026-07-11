import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import { appLogger } from '../logger';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  createDispute,
  createKycSession,
  getApplication,
  getBalances,
  getCard,
  getCardholderStatus,
  getCardPin,
  getCardSecrets,
  getContracts,
  getTransaction,
  getUser,
  handleCodegoWebhook,
  issueCard,
  listCards,
  listTransactions,
  updateCard,
} from './controllers/codegoController';
import {
  cardIdParamSchema,
  createDisputeBodySchema,
  createKycSessionBodySchema,
  issueCardBodySchema,
  listTransactionsQuerySchema,
  transactionIdParamSchema,
  updateCardBodySchema,
} from './schemas/codegoSchemas';

const router = Router();

const wrapAsync = (fn: (req: any, res: Response, next?: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      appLogger.error('Codego router error', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  };
};

// ── Step 1: Onboard (KYC iframe) ────────────────────────────────────
router.post(
  '/kyc/session',
  requireAuth,
  validateRequest({ body: createKycSessionBodySchema }),
  wrapAsync(createKycSession),
);
router.get('/status', requireAuth, wrapAsync(getCardholderStatus));
router.get('/application', requireAuth, wrapAsync(getApplication));
router.get('/user', requireAuth, wrapAsync(getUser));

// ── Step 2: Fund ────────────────────────────────────────────────────
router.get('/contracts', requireAuth, wrapAsync(getContracts));
router.get('/balances', requireAuth, wrapAsync(getBalances));

// ── Step 3 & 4: Cards ───────────────────────────────────────────────
router.post(
  '/cards',
  requireAuth,
  validateRequest({ body: issueCardBodySchema }),
  wrapAsync(issueCard),
);
router.get('/cards', requireAuth, wrapAsync(listCards));
router.get(
  '/cards/:cardId',
  requireAuth,
  validateRequest({ params: cardIdParamSchema }),
  wrapAsync(getCard),
);
router.patch(
  '/cards/:cardId',
  requireAuth,
  validateRequest({ params: cardIdParamSchema, body: updateCardBodySchema }),
  wrapAsync(updateCard),
);
router.get(
  '/cards/:cardId/secrets',
  requireAuth,
  validateRequest({ params: cardIdParamSchema }),
  wrapAsync(getCardSecrets),
);
router.get(
  '/cards/:cardId/pin',
  requireAuth,
  validateRequest({ params: cardIdParamSchema }),
  wrapAsync(getCardPin),
);

// ── Step 5: Transactions ────────────────────────────────────────────
router.get(
  '/transactions',
  requireAuth,
  validateRequest({ query: listTransactionsQuerySchema }),
  wrapAsync(listTransactions),
);
router.get(
  '/transactions/:txId',
  requireAuth,
  validateRequest({ params: transactionIdParamSchema }),
  wrapAsync(getTransaction),
);
router.post(
  '/transactions/:txId/disputes',
  requireAuth,
  validateRequest({ params: transactionIdParamSchema, body: createDisputeBodySchema }),
  wrapAsync(createDispute),
);

// ── Step 6: Webhook (HMAC Signature + Idempotency-Key) ──────────────
router.post('/webhook', wrapAsync(handleCodegoWebhook));

export default router;
