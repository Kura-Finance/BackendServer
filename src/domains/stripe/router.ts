/** Stripe HTTP routes: checkout, billing portal, status, webhook. */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import { appLogger } from '../logger';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  createBillingPortalSession,
  createCheckoutSession,
  getBillingStatus,
  handleStripeWebhook,
} from './controllers/stripeController';
import {
  createBillingPortalSessionBodySchema,
  createCheckoutSessionBodySchema,
} from './schemas/stripeSchemas';

const router = Router();

const wrapAsync = (fn: (req: any, res: Response, next?: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      appLogger.error('Stripe router error', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  };
};

router.post(
  '/checkout-session',
  requireAuth,
  validateRequest({ body: createCheckoutSessionBodySchema }),
  wrapAsync(createCheckoutSession),
);

router.post(
  '/billing-portal-session',
  requireAuth,
  validateRequest({ body: createBillingPortalSessionBodySchema }),
  wrapAsync(createBillingPortalSession),
);

router.get('/billing-status', requireAuth, wrapAsync(getBillingStatus));
router.post('/webhook', wrapAsync(handleStripeWebhook));

export default router;
