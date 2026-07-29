import type { BridgeFeeConfig } from '../models/types';
import { PAYOUT_LIQUIDATION_SOURCE } from '../models/types';
import { BridgeError } from './bridgeHttp';

// ── 費率設計：保證不虧本 ────────────────────────────────────────────────
//
// 核心原則：向用戶收的 developer fee 必須 ≥ Bridge 向「平台」收的批發成本，
// 否則每筆都在貼錢。費率一律由後端決定（不接受 client 指定），避免被改成 0。
//
// Bridge 向平台收的批發成本（2026 報價）：
//   - On-ramp（VA）：0.50% of volume
//   - Off-ramp（transfer）：0.25% of volume
//   - FX all-in：USD<>EUR 0.50%、USD<>MXN 0.50%、USD<>BRL 0.55%
//   - USDT 支援：+0.10%
//   - 固定費：$2 / VA / month active、$2 KYC、$10 KYB、$0.25 / wallet / month
//   - 第三方費（ACH / wire / gas）：pass-through
//
// 註：百分比固定費（$2/VA、$2 KYC 等）無法用百分比 fee 完全回收，小額入金仍會被
// 固定費吃掉 margin。fee_config 路徑會帶 minimum_fee 設下限；developer_fee_percent
// 路徑無法設下限（Bridge 限制），固定費由整體 margin 吸收。

// 平台 margin（疊加在 Bridge 批發成本之上，base 100：'0.25' = 0.25%）。
const PLATFORM_MARGIN_PERCENT = 0.25;

// USDT 目的幣的額外批發成本，直通給用戶（不另加 margin）。
const USDT_SURCHARGE_PERCENT = 0.1;

// 每筆 off-ramp 最低 fee（USD 計），避免極小額轉帳的 fee 被四捨五入吃掉。
const OFFRAMP_MIN_FEE = 0.5;

// Crypto liquidation address 批發成本（base 100，保守估計跨鏈 + 換匯）。
const CRYPTO_LIQUIDATION_WHOLESALE_PERCENT = 0.25;

// Bridge 向平台收的 on-ramp 批發成本（含 FX，base 100）。
const ONRAMP_WHOLESALE_PERCENT: Record<string, number> = {
  usd: 0.5, // onramp 0.50%
  gbp: 0.5, // onramp 0.50%
  eur: 0.5, // USD<>EUR FX all-in
  mxn: 0.5, // USD<>MXN FX all-in
  brl: 0.55, // USD<>BRL FX all-in
  cop: 0.5, // USD<>COP FX all-in
};

// Bridge 向平台收的 off-ramp 批發成本（依目的法幣，含 FX，base 100）。
const OFFRAMP_WHOLESALE_PERCENT: Record<string, number> = {
  usd: 0.25, // offramp 0.25%
  gbp: 0.25, // offramp 0.25%
  eur: 0.5, // USD<>EUR FX all-in
  mxn: 0.5, // USD<>MXN FX all-in
  brl: 0.55, // USD<>BRL FX all-in
  cop: 0.5, // 未報價，保守 buffer
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

/** 向上取兩位小數，確保收的 fee 不低於成本（不虧本）。 */
function ceil2(n: number): number {
  return Math.ceil(n * 100) / 100;
}

/** decimal string 去除尾端多餘 0（"0.500" → "0.5"，"1.000" → "1"）。 */
function trimDecimal(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** 入金費率 = 批發成本 + margin（+ USDT surcharge），向上取兩位小數。 */
export function onRampFeePercent(sourceCurrency: string, destinationCurrency: string): string | null {
  const wholesale = ONRAMP_WHOLESALE_PERCENT[sourceCurrency.toLowerCase()];
  if (wholesale === undefined) return null;
  const surcharge = destinationCurrency.toLowerCase() === 'usdt' ? USDT_SURCHARGE_PERCENT : 0;
  return ceil2(wholesale + PLATFORM_MARGIN_PERCENT + surcharge).toFixed(2);
}

// 之後若向 Bridge 申請開通 fee_config Beta，可改用 per-rail 的固定費 + 百分比
// （例如 USD 的 Fedwire 第三方固定費）。設 BRIDGE_FEE_CONFIG_ENABLED=true 啟用。
function buildFeeConfig(feePercent: string): BridgeFeeConfig {
  return {
    source: {
      // minimum_fee 確保小額入金仍能覆蓋 Bridge 固定費（$2/VA、$2 KYC）的一部分。
      default: { fee_percent: feePercent, minimum_fee: '2.00' },
    },
  };
}

function isFeeConfigEnabled(): boolean {
  return process.env.BRIDGE_FEE_CONFIG_ENABLED === 'true';
}

/**
 * 依入金幣別 + 目的幣組出要送給 Bridge 的費用欄位。
 * - BRIDGE_FEE_CONFIG_ENABLED=true → 回傳 { fee_config }（含 minimum_fee 下限）
 * - 否則 → 回傳 { developer_fee_percent }
 * - 無對應費率設定 → 回傳 {}（不收費，理論上不會發生：幣別由 schema enum 限制）
 * fee_config 與 developer_fee_percent 互斥，只會回傳其中一個。
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
 * 計算 off-ramp 要送給 Bridge 的 developer_fee（絕對金額，以 source 穩定幣計）。
 * = max(amount × (批發成本 + margin)%, OFFRAMP_MIN_FEE)，向上取 2 位小數。
 * 一律由後端計算，不接受 client 指定，避免被設成 0。
 */
export function computeOffRampDeveloperFee(amount: string, destinationCurrency: string): string {
  const amt = Number(amount);
  const wholesale = OFFRAMP_WHOLESALE_PERCENT[destinationCurrency.toLowerCase()] ?? 0.25;
  if (!Number.isFinite(amt) || amt <= 0) return trimDecimal(OFFRAMP_MIN_FEE.toFixed(2));
  const pctFee = ceil2((amt * (wholesale + PLATFORM_MARGIN_PERCENT)) / 100);
  // fee 不可超過轉帳本金（理論上不會發生，極小額時 minimum_fee 仍可能逼近本金）。
  const fee = Math.min(Math.max(pctFee, OFFRAMP_MIN_FEE), amt);
  return trimDecimal(fee.toFixed(2));
}

/** Liquidation Address 的 custom_developer_fee_percent（base 100，含 USDT surcharge）。 */
export function cryptoLiquidationFeePercent(): string {
  return ceil2(
    CRYPTO_LIQUIDATION_WHOLESALE_PERCENT + PLATFORM_MARGIN_PERCENT,
  ).toFixed(2);
}

/** Payout LA 的 custom_developer_fee_percent（base 100，依目的法幣批發 + margin）。 */
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
