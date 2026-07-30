/**
 * Fiat currency → Bridge endorsement (rail permission) mapping.
 */

import type { BridgeEndorsementType } from '../models/types';

// On-ramp / off-ramp fiat currency → required Bridge endorsement (rail).
// All are API-driven via POST /endorsement-link or GET /customers/{id}/kyc_link?endorsement=...
//   usd  → base (granted by default after KYC; no extra hosted flow)
//   gbp  → faster_payments; eur → sepa; mxn → spei
//   brl  → pix; cop → cop
export const CURRENCY_ENDORSEMENT: Record<string, BridgeEndorsementType> = {
  usd: 'base',
  gbp: 'faster_payments',
  eur: 'sepa',
  mxn: 'spei',
  brl: 'pix',
  cop: 'cop',
};

/** Resolve required endorsement for a fiat currency; usd/base returns null (no extra request). */
export function resolveEndorsementForCurrency(currency: string): BridgeEndorsementType | null {
  const endorsement = CURRENCY_ENDORSEMENT[currency.toLowerCase()];
  if (!endorsement || endorsement === 'base') return null;
  return endorsement;
}
