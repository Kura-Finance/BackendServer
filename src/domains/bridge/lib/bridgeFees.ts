/**
 * Developer fee math: ensure user fees cover Bridge wholesale cost + margin.
 *
 * Fees are always set server-side (never from the client) so they cannot be zeroed.
 * Bridge wholesale (2026): on-ramp VA 0.50%, off-ramp 0.25%, FX all-in ~0.50–0.55%,
 * USDT +0.10%, plus fixed fees ($2/VA/mo, $2 KYC, …). Fixed fees cannot be fully
 * recovered via percent alone; fee_config can set minimum_fee, developer_fee_percent cannot.
 */

import type { BridgeFeeConfig } from '../models/types';
import { PAYOUT_LIQUIDATION_SOURCE } from '../models/types';
import { BridgeError } from './bridgeHttp';

// Platform margin on top of Bridge wholesale (base 100: 0.25 = 0.25%).
const PLATFORM_MARGIN_PERCENT = 0.25;

// Extra wholesale for USDT destination; passed through (no extra margin).
const USDT_SURCHARGE_PERCENT = 0.1;

// Per off-ramp floor (USD) so tiny transfers are not rounded to zero fee.
const OFFRAMP_MIN_FEE = 0.5;

// Crypto liquidation address wholesale (base 100; conservative cross-chain + FX).
const CRYPTO_LIQUIDATION_WHOLESALE_PERCENT = 0.25;

// Bridge on-ramp wholesale to platform (incl. FX, base 100).
const ONRAMP_WHOLESALE_PERCENT: Record<string, number> = {
  usd: 0.5, // onramp 0.50%
  gbp: 0.5, // onramp 0.50%
  eur: 0.5, // USD<>EUR FX all-in
  mxn: 0.5, // USD<>MXN FX all-in
  brl: 0.55, // USD<>BRL FX all-in
  cop: 0.5, // USD<>COP FX all-in
};

// Bridge off-ramp wholesale by destination fiat (incl. FX, base 100).
const OFFRAMP_WHOLESALE_PERCENT: Record<string, number> = {
  usd: 0.25, // offramp 0.25%
  gbp: 0.25, // offramp 0.25%
  eur: 0.5, // USD<>EUR FX all-in
  mxn: 0.5, // USD<>MXN FX all-in
  brl: 0.55, // USD<>BRL FX all-in
  cop: 0.5, // unquoted; conservative buffer
};

const OFFRAMP_RAIL_CURRENCY: Record<string, string> = {
  ach: 'usd',
  ach_push: 'usd',
  ach_same_day: 'usd',
  wire: 'usd',
  sepa: 'eur',
  faster_payments: 'gbp',
  pix: 'brl',
  spei: 'mxn',
  bre_b: 'cop',
  co_bank_transfer: 'cop',
};

export function assertOffRampRailCurrency(destinationRail: string, destinationCurrency: string): void {
  const expected = OFFRAMP_RAIL_CURRENCY[destinationRail.toLowerCase()];
  if (!expected || expected === destinationCurrency.toLowerCase()) return;
  throw new BridgeError(
    400,
    `destinationRail "${destinationRail}" requires destinationCurrency "${expected}".`,
    'assertOffRampRailCurrency',
  );
}

/** Ceil to 2 decimals so collected fee is never below cost. */
function ceil2(n: number): number {
  return Math.ceil(n * 100) / 100;
}

/** Trim trailing zeros from a decimal string ("0.500" → "0.5"). */
function trimDecimal(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** On-ramp fee % = wholesale + margin (+ USDT surcharge), ceiled to 2dp. */
export function onRampFeePercent(sourceCurrency: string, destinationCurrency: string): string | null {
  const wholesale = ONRAMP_WHOLESALE_PERCENT[sourceCurrency.toLowerCase()];
  if (wholesale === undefined) return null;
  const surcharge = destinationCurrency.toLowerCase() === 'usdt' ? USDT_SURCHARGE_PERCENT : 0;
  return ceil2(wholesale + PLATFORM_MARGIN_PERCENT + surcharge).toFixed(2);
}

// When Bridge fee_config Beta is enabled, use per-rail fixed + percent
// (e.g. Fedwire pass-through). Set BRIDGE_FEE_CONFIG_ENABLED=true.
function buildFeeConfig(feePercent: string): BridgeFeeConfig {
  return {
    source: {
      // minimum_fee helps small deposits cover Bridge fixed fees ($2/VA, $2 KYC).
      default: { fee_percent: feePercent, minimum_fee: '2.00' },
    },
  };
}

function isFeeConfigEnabled(): boolean {
  return process.env.BRIDGE_FEE_CONFIG_ENABLED === 'true';
}

/**
 * Build fee fields for Bridge VA create from source + destination currency.
 * - BRIDGE_FEE_CONFIG_ENABLED=true → { fee_config } (with minimum_fee)
 * - else → { developer_fee_percent }
 * - no rate → {} (should not happen; currency is schema-enum constrained)
 * fee_config and developer_fee_percent are mutually exclusive.
 */
export function buildVirtualAccountFeeBody(
  sourceCurrency: string,
  destinationCurrency: string,
): { fee_config: BridgeFeeConfig } | { developer_fee_percent: string } | Record<string, never> {
  const percent = onRampFeePercent(sourceCurrency, destinationCurrency);
  if (!percent) return {};
  if (isFeeConfigEnabled()) return { fee_config: buildFeeConfig(percent) };
  return { developer_fee_percent: percent };
}

/**
 * Off-ramp developer_fee absolute amount (source stablecoin) for Bridge.
 * = max(amount × (wholesale + margin)%, OFFRAMP_MIN_FEE), ceiled to 2dp.
 * Always server-computed; never accept client value.
 */
export function computeOffRampDeveloperFee(amount: string, destinationCurrency: string): string {
  const amt = Number(amount);
  const wholesale = OFFRAMP_WHOLESALE_PERCENT[destinationCurrency.toLowerCase()] ?? 0.25;
  if (!Number.isFinite(amt) || amt <= 0) return trimDecimal(OFFRAMP_MIN_FEE.toFixed(2));
  const pctFee = ceil2((amt * (wholesale + PLATFORM_MARGIN_PERCENT)) / 100);
  // Fee must not exceed principal (tiny amounts may push min fee near amount).
  const fee = Math.min(Math.max(pctFee, OFFRAMP_MIN_FEE), amt);
  return trimDecimal(fee.toFixed(2));
}

/** Liquidation Address custom_developer_fee_percent (base 100; USDT surcharge included). */
export function cryptoLiquidationFeePercent(): string {
  return ceil2(
    CRYPTO_LIQUIDATION_WHOLESALE_PERCENT + PLATFORM_MARGIN_PERCENT,
  ).toFixed(2);
}

/** Payout LA custom_developer_fee_percent (base 100; dest fiat wholesale + margin). */
export function payoutLiquidationFeePercent(destinationCurrency: string): string {
  const wholesale = OFFRAMP_WHOLESALE_PERCENT[destinationCurrency.toLowerCase()] ?? 0.25;
  return ceil2(wholesale + PLATFORM_MARGIN_PERCENT).toFixed(2);
}

export function buildPayoutDeveloperFee(
  developerFeePercent: string | null,
  destinationCurrency: string,
): { developerFeePercent: string; feeCurrency: string } {
  const fallback = payoutLiquidationFeePercent(destinationCurrency);
  return {
    developerFeePercent: developerFeePercent ?? fallback,
    feeCurrency: PAYOUT_LIQUIDATION_SOURCE.sourceCurrency,
  };
}

export function buildDepositDeveloperFee(
  feeCurrency: string,
  developerFeePercent: string | null,
  fallbackPercent: string,
): { developerFeePercent: string; feeCurrency: string } {
  return {
    developerFeePercent: developerFeePercent ?? fallbackPercent,
    feeCurrency: feeCurrency.toLowerCase(),
  };
}
