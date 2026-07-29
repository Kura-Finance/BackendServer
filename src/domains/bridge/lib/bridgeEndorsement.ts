import type { BridgeEndorsementType } from '../models/types';

// 入金 / 出金法幣幣別 → 需要的 Bridge endorsement（rail 權限）。
// 這些全是 API 驅動：用 POST /endorsement-link 或 GET /customers/{id}/kyc_link?endorsement=... 申請。
//   usd  → base（KYC 通過預設具備，無需額外 hosted flow）
//   gbp  → faster_payments；eur → sepa；mxn → spei
//   brl  → pix；cop → cop
export const CURRENCY_ENDORSEMENT: Record<string, BridgeEndorsementType> = {
  usd: 'base',
  gbp: 'faster_payments',
  eur: 'sepa',
  mxn: 'spei',
  brl: 'pix',
  cop: 'cop',
};

/** 依法幣幣別解析所需 endorsement；usd/base 回傳 null（不需額外申請）。 */
export function resolveEndorsementForCurrency(currency: string): BridgeEndorsementType | null {
  const endorsement = CURRENCY_ENDORSEMENT[currency.toLowerCase()];
  if (!endorsement || endorsement === 'base') return null;
  return endorsement;
}
