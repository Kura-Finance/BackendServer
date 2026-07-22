export type PlatformRecordCategory = 'revenue' | 'waitlist' | 'active_users';

export type PlatformRevenueSource =
  | 'stripe'
  | 'bridge_va'
  | 'bridge_transfer'
  | 'bridge_liquidation_in'
  | 'bridge_liquidation_out'
  | 'card'
  | 'dinari'
  | 'lifi'
  | 'earn'
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
  processAmount?: number | null;
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

export interface InvestorProcessBySource {
  processUsd: number;
  platformFeeUsd: number;
  netUsd: number;
  count: number;
}

export interface InvestorProcessSummary {
  totalProcessUsd: number;
  totalPlatformFeeUsd: number;
  totalNetUsd: number;
  eventCount: number;
  bySource: Record<string, InvestorProcessBySource>;
}

export type PlatformRevenueProductKey =
  | 'bridge'
  | 'swap'
  | 'dinari'
  | 'earn'
  | 'card'
  | 'subscriptions';

export interface PlatformRevenueProductLine {
  key: PlatformRevenueProductKey;
  label: string;
  /** Processing / volume basis (USD). Earn uses AUM here as context only. */
  processUsd: number;
  /** Kura platform revenue for this product (USD). */
  revenueUsd: number;
  /** Fee rate in basis points; null = N/A / reserved / not volume-based. */
  rateBps: number | null;
  count: number;
  status: 'active' | 'zero_fee' | 'reserved';
}

/**
 * Canonical Investor Platform revenue — single source of truth.
 * Frontend must display `totalUsd` / `byProduct` and must not re-estimate fees.
 */
export interface PlatformRevenueSummary {
  totalUsd: number;
  policy: {
    bridgeRateBps: number;
    swapRateBps: number;
    dinariRateBps: number;
    earnPerformanceFeeBps: number;
    cardRateBps: number | null;
  };
  byProduct: {
    bridge: PlatformRevenueProductLine;
    swap: PlatformRevenueProductLine;
    dinari: PlatformRevenueProductLine;
    earn: PlatformRevenueProductLine & {
      aumUsd: number;
      performanceFeeBps: number;
    };
    /** Reserved for future Card product — always present, usually $0. */
    card: PlatformRevenueProductLine;
    subscriptions: PlatformRevenueProductLine;
  };
}

/** GET /api/platform-insights/summary 回應資料 */
export interface InvestorSummary {
  period: { from: string; to: string };
  process: InvestorProcessSummary;
  /**
   * Single source of truth for "Platform revenue".
   * Prefer this over process.totalNetUsd for Investor UI.
   */
  platformRevenue: PlatformRevenueSummary;
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
  /** Morpho Earn FeeWrapper AUM on Base (live from Morpho GraphQL). */
  earn: {
    chainId: number;
    totalAssetsUsd: number;
    vaultCount: number;
    vaults: Array<{
      innerVaultAddress: string;
      feeWrapperAddress: string;
      name: string | null;
      symbol: string | null;
      totalAssetsUsd: number;
    }>;
    /** Performance fee rate on FeeWrappers (bps). */
    performanceFeeBps: number;
    /** Accrued / recognized Earn platform revenue in period (USD). */
    revenueUsd: number;
    fetchedAt: string;
    error?: string;
  };
}

/** GET /api/platform-insights/records、/process-events 單筆紀錄 */
export interface PlatformRecordResponse {
  id: string;
  category: string;
  userId: string | null;
  source: string;
  eventType: string;
  idempotencyKey: string;
  email: string | null;
  product: string | null;
  processAmount: number | null;
  platformFee: number | null;
  netAmount: number | null;
  currency: string;
  externalId: string | null;
  depositId: string | null;
  scaAddress: string | null;
  occurredAt: string;
  metadata: unknown;
  createdAt: string;
}

/** GET /api/platform-insights/records 回應資料 */
export interface PlatformRecordsListResponse {
  records: PlatformRecordResponse[];
  total: number;
  count: number;
}

/** GET /api/platform-insights/process-events 回應資料 */
export interface ProcessEventsListResponse {
  events: PlatformRecordResponse[];
  count: number;
}

/** @deprecated use RecordPlatformRecordInput */
export type RecordPlatformRevenueInput = RecordPlatformRecordInput;
