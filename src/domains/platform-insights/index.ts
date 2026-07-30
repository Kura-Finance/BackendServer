/**
 * Public exports for the platform-insights domain.
 */

export { PlatformRecordService, PlatformRevenueService } from './services/platformRevenueService';
export { platformInsightsRouter } from './router';
export type {
  InvestorProcessBySource,
  InvestorProcessSummary,
  InvestorSummary,
  PlatformRecordCategory,
  PlatformRecordResponse,
  PlatformRecordsListResponse,
  PlatformRevenueProductKey,
  PlatformRevenueProductLine,
  PlatformRevenueSource,
  PlatformRevenueSummary,
  ProcessEventsListResponse,
  RecordPlatformRecordInput,
  RecordPlatformRevenueInput,
} from './models/types';
export { REFERRABLE_REVENUE_SOURCES } from './models/types';
export {
  OFFICIAL_FEE_WRAPPER_DEFAULTS,
  fetchEarnManagedAssets,
} from './lib/morphoEarn';
export type { EarnManagedAssetsSummary, EarnVaultAssets, MorphoFeeWrapperMap } from './lib/morphoEarn';
export {
  BRIDGE_PLATFORM_FEE_BPS,
  BRIDGE_PLATFORM_FEE_RATE,
  CARD_PLATFORM_FEE_BPS,
  DINARI_PLATFORM_FEE_BPS,
  DINARI_PLATFORM_FEE_RATE,
  EARN_PERFORMANCE_FEE_BPS,
  SWAP_PLATFORM_FEE_BPS,
  SWAP_PLATFORM_FEE_RATE,
  platformFeeFromProcess,
} from './lib/revenuePolicy';
export { isDinariOrderFilled, isDinariOrderCancelled } from './services/platformRevenueService';
