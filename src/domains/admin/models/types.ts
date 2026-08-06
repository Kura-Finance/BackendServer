/**
 * Admin dashboard DTOs — mirrors Kura Admin Dashboard (`dashboard/lib/types.ts`).
 */

export type UserTier = 'Basic' | 'Pro' | 'Ultimate';

export type BridgeKycStatus =
  | 'not_started'
  | 'incomplete'
  | 'awaiting_questionnaire'
  | 'awaiting_ubo'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'paused'
  | 'offboarded';

export type DinariKycStatus =
  | 'not_started'
  | 'PENDING'
  | 'PASS'
  | 'REJECTED'
  | 'APPROVED';

export type RevenueActivity = {
  volumeUsd: number;
  feeUsd: number;
  count: number;
};

export type AdminUser = {
  id: string;
  email: string;
  name?: string;
  tier: UserTier;
  eoaAddress: string | null;
  scaAddress: string | null;
  bridgeKyc: BridgeKycStatus;
  dinariKyc: DinariKycStatus;
  /** Always 0 today — SCA balances are E2EE; server cannot decrypt. */
  walletBalanceUsd: number;
  bridge: RevenueActivity;
  dinari: RevenueActivity;
  /** Platform suspend after Bridge Fraud Alert. */
  fraudSuspended: boolean;
  fraudSuspendReason: string | null;
  createdAt: string;
};

export type FeeWarpVault = {
  wrapperAddress: string;
  innerVaultAddress: string;
  label: string;
  /** Always 0 today — no FeeWarp deposit MAU indexer yet. */
  mau: number;
  tvlUsd: number;
  performanceFeeBps: number;
};

export type OverviewMetrics = {
  totalUsers: number;
  bridgeKycApproved: number;
  bridgeKycPending: number;
  bridgeKycRejected: number;
  bridgeKycNotStarted: number;
  bridgeKycRate: number;
  bridgeVolumeUsd: number;
  bridgeFeeUsd: number;
  bridgeTransferCount: number;
  dinariKycPassed: number;
  dinariVolumeUsd: number;
  dinariFeeUsd: number;
  dinariOrderCount: number;
  lifiVolumeUsd: number;
  lifiFeeUsd: number;
  lifiTransferCount: number;
  totalWalletBalanceUsd: number;
  feeWarpMauTotal: number;
  feeWarpTvlUsd: number;
  /** Current UTC month Bridge fraud-rate snapshot (Penalty Box). */
  bridgeFraud: {
    month: string;
    openFraudAlerts: number;
    combinedCountRateBps: number;
    combinedVolumeRateBps: number;
    inPenaltyBoxRisk: boolean;
    inCriticalRisk: boolean;
  };
};

export type LifiAdminSummary = {
  volumeUsd: number;
  feeUsd: number;
  transferCount: number;
};
