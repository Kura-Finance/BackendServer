export type PlatformRecordCategory = 'revenue' | 'waitlist' | 'active_users';

export type PlatformRevenueSource =
  | 'stripe'
  | 'bridge_va'
  | 'bridge_transfer'
  | 'bridge_liquidation_in'
  | 'bridge_liquidation_out'
  | 'card'
  | 'dinari'
  | 'waitlist'
  | 'privy';

/** 可計入 Refer 分潤的營收來源（寫入 PlatformRecord.metadata.referrable）。 */
export const REFERRABLE_REVENUE_SOURCES = new Set<string>([
  'stripe',
  'bridge_va',
  'bridge_transfer',
  'bridge_liquidation_in',
  'bridge_liquidation_out',
  'card',
  'dinari',
]);

export interface RecordPlatformRecordInput {
  category?: PlatformRecordCategory;
  userId?: string | null;
  source: string;
  eventType: string;
  idempotencyKey: string;
  email?: string | null;
  product?: string | null;
  grossAmount?: number | null;
  platformFee?: number | null;
  netAmount?: number | null;
  currency?: string;
  externalId?: string | null;
  depositId?: string | null;
  scaAddress?: string | null;
  occurredAt: Date;
  /** 是否為可分 Refer 營收；revenue 類別且來源在 REFERRABLE_REVENUE_SOURCES 時預設 true。 */
  referrable?: boolean;
  /** 被邀請人的邀請人；未提供且 referrable 時由 userId 查 User.referredByUserId。 */
  inviterUserId?: string | null;
  /** Stripe 等來源專用，寫入 ReferralCashback 供退款/爭議沖銷。 */
  referralContext?: {
    stripeInvoiceId?: string | null;
    stripeChargeId?: string | null;
    stripeSubscriptionId?: string | null;
  };
  metadata?: Record<string, unknown>;
}

export interface InvestorSummary {
  period: { from: string; to: string };
  revenue: {
    totalGrossUsd: number;
    totalPlatformFeeUsd: number;
    totalNetUsd: number;
    eventCount: number;
    bySource: Record<string, { grossUsd: number; platformFeeUsd: number; netUsd: number; count: number }>;
  };
  waitlist: {
    totalSignups: number;
    byProduct: Record<string, number>;
  };
  subscriptions: {
    activeCount: number;
    byTier: Record<string, number>;
  };
  activeUsers: {
    totalUsers: number;
    activeUsers: number;
    periodFrom: string;
    periodTo: string;
    lastSyncedAt: string | null;
  };
}

/** @deprecated use RecordPlatformRecordInput */
export type RecordPlatformRevenueInput = RecordPlatformRecordInput;
