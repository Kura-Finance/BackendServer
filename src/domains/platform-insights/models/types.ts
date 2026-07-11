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
