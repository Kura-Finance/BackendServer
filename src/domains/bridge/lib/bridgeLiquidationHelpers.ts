/**
 * Helpers for matching and creating Bridge liquidation / payout addresses.
 */

import type { BridgeLiquidationAddressResponse } from '../models/types';
import {
  LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC,
  PAYOUT_LIQUIDATION_SOURCE,
} from '../models/types';
import { BridgeError } from './bridgeHttp';

export function isDuplicateLiquidationAddress(error: unknown): boolean {
  if (!(error instanceof BridgeError)) return false;
  if (error.statusCode !== 400 && error.statusCode !== 409) return false;
  try {
    const parsed = JSON.parse(error.bridgeBody) as { code?: string; message?: string };
    const haystack = `${parsed.code ?? ''} ${parsed.message ?? ''} ${error.bridgeBody}`.toLowerCase();
    return haystack.includes('duplicate') || haystack.includes('already');
  } catch {
    return /duplicate|already/i.test(error.bridgeBody);
  }
}

export function matchesLiquidationRoute(
  la: BridgeLiquidationAddressResponse,
  pair: typeof LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC,
  destinationAddress: string,
): boolean {
  return (
    la.chain === pair.sourceChain
    && la.currency === pair.sourceCurrency
    && la.destination_payment_rail === pair.destinationRail
    && la.destination_currency === pair.destinationCurrency
    && (la.destination_address?.toLowerCase() ?? '') === destinationAddress.toLowerCase()
  );
}

export function matchesPayoutLiquidationRoute(
  la: BridgeLiquidationAddressResponse,
  params: {
    destinationRail: string;
    destinationCurrency: string;
    externalAccountId: string;
  },
): boolean {
  const source = PAYOUT_LIQUIDATION_SOURCE;
  return (
    la.chain === source.sourceChain
    && la.currency === source.sourceCurrency
    && la.destination_payment_rail === params.destinationRail
    && la.destination_currency === params.destinationCurrency
    && (la.external_account_id ?? '') === params.externalAccountId
  );
}

export function buildPayoutDestinationReferenceFields(
  destinationRail: string,
  destinationReference?: string,
): Record<string, string> {
  if (!destinationReference) return {};
  const rail = destinationRail.toLowerCase();
  if (rail === 'wire') return { destination_wire_message: destinationReference };
  if (rail === 'spei') return { destination_spei_reference: destinationReference };
  if (rail === 'sepa') return { destination_sepa_reference: destinationReference };
  if (rail === 'ach' || rail === 'ach_push' || rail === 'ach_same_day') {
    return { destination_ach_reference: destinationReference };
  }
  return { destination_reference: destinationReference };
}
