/**
 * Investor / platform revenue accounting policy.
 * Frontend must use summary.platformRevenue — do not re-estimate fees client-side.
 */

/** 0.25% = 25 bps */
export const BRIDGE_PLATFORM_FEE_RATE = 0.0025;
export const BRIDGE_PLATFORM_FEE_BPS = 25;

/** Swap (LI.FI) integrator fee for Investor accounting: 0.25% */
export const SWAP_PLATFORM_FEE_RATE = 0.0025;
export const SWAP_PLATFORM_FEE_BPS = 25;

/** Dinari temporarily contributes $0 platform fee */
export const DINARI_PLATFORM_FEE_RATE = 0;
export const DINARI_PLATFORM_FEE_BPS = 0;

/** Morpho Earn FeeWrapper performance fee (10%) */
export const EARN_PERFORMANCE_FEE_RATE = 0.1;
export const EARN_PERFORMANCE_FEE_BPS = 1000;

/** Card reserved — rate TBD */
export const CARD_PLATFORM_FEE_BPS: number | null = null;

export function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Kura platform fee from processing volume. */
export function platformFeeFromProcess(
  processAmount: number | null | undefined,
  rate: number,
): number {
  if (processAmount == null || !Number.isFinite(processAmount) || processAmount <= 0) {
    return 0;
  }
  return roundUsd(processAmount * rate);
}

export function isBridgeRevenueSource(source: string): boolean {
  return source === 'bridge_va'
    || source === 'bridge_transfer'
    || source === 'bridge_liquidation_in'
    || source === 'bridge_liquidation_out'
    || source.startsWith('bridge_');
}

export function isSwapRevenueSource(source: string): boolean {
  return source === 'lifi';
}

export function isDinariRevenueSource(source: string): boolean {
  return source === 'dinari';
}

export function isStripeRevenueSource(source: string): boolean {
  return source === 'stripe';
}

export function isCardRevenueSource(source: string): boolean {
  return source === 'card';
}
