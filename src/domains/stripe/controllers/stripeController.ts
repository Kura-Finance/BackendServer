/** Stripe HTTP controllers for checkout, portal, billing status, and webhooks. */

import { Request, Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { StripeService } from '../services/stripeService';

function getAuthenticatedUserId(req: AuthRequest, res: Response): string | null {
  if (!req.userId) {
    sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return null;
  }

  return req.userId;
}

/** Create a Stripe Checkout Session for a subscription price. */
export const createCheckoutSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { priceId, successUrl, cancelUrl } = req.body as {
      priceId: string;
      successUrl: string;
      cancelUrl: string;
    };

    const result = await StripeService.createCheckoutSession(userId, priceId, successUrl, cancelUrl);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Create Stripe checkout session failed', error, { userId: req.userId });
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
};

/** Create a Stripe Customer Portal session. */
export const createBillingPortalSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { returnUrl } = req.body as { returnUrl: string };
    const result = await StripeService.createBillingPortalSession(userId, returnUrl);
    sendSuccess(res, result);
  } catch (error) {
    logError('Create Stripe billing portal session failed', error, { userId: req.userId });
    const message = error instanceof Error ? error.message : 'Failed to create billing portal session';
    sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
};

/** Return the user's current billing / subscription status. */
export const getBillingStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await StripeService.getBillingStatus(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Get Stripe billing status failed', error, { userId: req.userId });
    const message = error instanceof Error ? error.message : 'Failed to fetch billing status';
    sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
};

/** Verify and process a Stripe webhook event. */
export const handleStripeWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'];

  if (typeof signature !== 'string') {
    sendError(res, 400, { code: 'INVALID_SIGNATURE', message: 'Missing Stripe signature' });
    return;
  }

  if (!Buffer.isBuffer(req.body)) {
    sendError(res, 400, {
      code: 'INVALID_WEBHOOK_BODY',
      message: 'Stripe webhook body must be a raw buffer',
    });
    return;
  }

  try {
    const event = StripeService.constructWebhookEvent(req.body, signature);
    await StripeService.handleWebhookEvent(event);
    res.status(200).json({ received: true });
  } catch (error) {
    logError('Stripe webhook processing failed', error);
    const message = error instanceof Error ? error.message : 'Webhook processing failed';
    sendError(res, 400, { code: 'WEBHOOK_ERROR', message });
  }
};
