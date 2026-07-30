/** Stripe billing public result types. */

export type TierName = 'Basic' | 'Pro' | 'Ultimate';

export type CheckoutSessionResult = {
  sessionId: string;
  checkoutUrl: string;
};

export type BillingPortalSessionResult = {
  portalUrl: string;
};

export type BillingStatusResult = {
  tier: TierName | string;
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};
