import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '../../shared/lib/prisma';
import { logDebug, logError } from '../../logger';
import { updateUserTier } from '../../shared/lib/apiRateLimitUtil';
import type {
  BillingPortalSessionResult,
  BillingStatusResult,
  CheckoutSessionResult,
  TierName,
} from '../models/types';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  'trialing',
  'active',
  'past_due',
]);

export class StripeService {
  private static stripeClient: Stripe | null = null;

  private static getStripeClient(): Stripe {
    if (this.stripeClient) {
      return this.stripeClient;
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('Stripe secret key is missing');
    }

    this.stripeClient = new Stripe(secretKey);
    return this.stripeClient;
  }

  private static getWebhookSecret(): string {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('Stripe webhook secret is missing');
    }
    return webhookSecret;
  }

  private static getTierByPriceId(priceId: string | null | undefined): TierName | null {
    if (!priceId) return null;

    const priceToTierMap = new Map<string, TierName>();
    if (process.env.STRIPE_PRICE_PRO) priceToTierMap.set(process.env.STRIPE_PRICE_PRO, 'Pro');
    if (process.env.STRIPE_PRICE_ULTIMATE) priceToTierMap.set(process.env.STRIPE_PRICE_ULTIMATE, 'Ultimate');
    if (process.env.STRIPE_PRICE_VIP) priceToTierMap.set(process.env.STRIPE_PRICE_VIP, 'VIP');

    return priceToTierMap.get(priceId) ?? null;
  }

  private static toDateTime(unixTimestamp?: number | null): Date | null {
    if (!unixTimestamp) return null;
    return new Date(unixTimestamp * 1000);
  }

  private static async getOrCreateCustomer(userId: string): Promise<{ customerId: string; email: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        stripeCustomerId: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.stripeCustomerId) {
      return { customerId: user.stripeCustomerId, email: user.email };
    }

    const stripe = this.getStripeClient();
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        userId: user.id,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    });

    return { customerId: customer.id, email: user.email };
  }

  static constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.getStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      this.getWebhookSecret(),
    );
  }

  static async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CheckoutSessionResult> {
    const stripe = this.getStripeClient();
    const { customerId } = await this.getOrCreateCustomer(userId);
    const selectedTier = this.getTierByPriceId(priceId);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: userId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        userId,
        selectedTier: selectedTier ?? '',
      },
      subscription_data: {
        metadata: {
          userId,
          selectedTier: selectedTier ?? '',
        },
      },
    });

    if (!session.url) {
      throw new Error('Stripe checkout session URL is missing');
    }

    return {
      sessionId: session.id,
      checkoutUrl: session.url,
    };
  }

  static async createBillingPortalSession(
    userId: string,
    returnUrl: string,
  ): Promise<BillingPortalSessionResult> {
    const stripe = this.getStripeClient();
    const { customerId } = await this.getOrCreateCustomer(userId);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return {
      portalUrl: session.url,
    };
  }

  static async getBillingStatus(userId: string): Promise<BillingStatusResult> {
    const [user, latestSubscription] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { tier: true },
      }),
      prisma.stripeSubscription.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const hasActiveSubscription = latestSubscription
      ? ACTIVE_SUBSCRIPTION_STATUSES.has(latestSubscription.status as Stripe.Subscription.Status)
      : false;

    return {
      tier: user?.tier || 'Basic',
      hasActiveSubscription,
      subscriptionStatus: latestSubscription?.status ?? null,
      stripeSubscriptionId: latestSubscription?.stripeSubscriptionId ?? null,
      stripePriceId: latestSubscription?.stripePriceId ?? null,
      currentPeriodEnd: latestSubscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: latestSubscription?.cancelAtPeriodEnd ?? false,
    };
  }

  static async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    const existing = await prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
      select: { id: true },
    });

    if (existing) {
      logDebug('Stripe webhook already processed', { eventId: event.id, type: event.type });
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
        await this.handleInvoiceEvent(event.data.object as Stripe.Invoice);
        break;
      default:
        logDebug('Unhandled Stripe webhook type', { type: event.type, eventId: event.id });
        break;
    }

    try {
      await prisma.stripeWebhookEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          payload: event.data.object as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  private static async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const customerId = typeof session.customer === 'string' ? session.customer : null;
    const userId = session.client_reference_id || session.metadata?.userId || null;

    if (!userId || !customerId) {
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });
  }

  private static async handleInvoiceEvent(invoice: Stripe.Invoice): Promise<void> {
    const parent = invoice.parent;
    if (!parent?.subscription_details?.subscription) {
      return;
    }

    const subscriptionRef = parent.subscription_details.subscription;
    const subscriptionId =
      typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id;

    const stripe = this.getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await this.syncSubscription(subscription);
  }

  private static async syncSubscription(subscription: Stripe.Subscription): Promise<void> {
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;
    const userId = await this.resolveUserId(subscription, customerId);

    if (!userId) {
      logError('Unable to resolve user for Stripe subscription', new Error('Missing user mapping'), {
        stripeSubscriptionId: subscription.id,
        customerId,
      });
      return;
    }

    const stripePriceId = subscription.items.data[0]?.price?.id || null;

    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });

    await prisma.stripeSubscription.upsert({
      where: {
        stripeSubscriptionId: subscription.id,
      },
      update: {
        userId,
        stripeCustomerId: customerId,
        stripePriceId,
        status: subscription.status,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: this.toDateTime(subscription.canceled_at),
        metadata: subscription.metadata as unknown as Prisma.InputJsonValue,
      },
      create: {
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId,
        status: subscription.status,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: this.toDateTime(subscription.canceled_at),
        metadata: subscription.metadata as unknown as Prisma.InputJsonValue,
      },
    });

    await this.applyTierBySubscription(userId, subscription.status, stripePriceId);
  }

  private static async resolveUserId(
    subscription: Stripe.Subscription,
    customerId: string,
  ): Promise<string | null> {
    const metadataUserId = subscription.metadata?.userId;
    if (metadataUserId) {
      return metadataUserId;
    }

    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });

    return user?.id ?? null;
  }

  private static async applyTierBySubscription(
    userId: string,
    status: Stripe.Subscription.Status,
    stripePriceId: string | null,
  ): Promise<void> {
    if (!ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
      await updateUserTier(userId, 'Basic');
      return;
    }

    const mappedTier = this.getTierByPriceId(stripePriceId);
    if (!mappedTier) {
      logDebug('Stripe subscription priceId is not mapped to tier', {
        userId,
        stripePriceId,
      });
      return;
    }

    await updateUserTier(userId, mappedTier);
  }
}
