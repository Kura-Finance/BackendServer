/**
 * Bridge (api.bridge.xyz) On/Off Ramp Service — public facade.
 *
 * Domain logic lives in sibling services and lib/; this module keeps the
 * stable BridgeService / BridgeError import surface unchanged.
 *
 * Methods are bound to their domain class so internal `this.` helpers keep working.
 */

import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '../../shared/lib/prisma';
import { BridgeCustomerService } from './bridgeCustomerService';
import { BridgeVirtualAccountService } from './bridgeVirtualAccountService';
import { BridgePayoutService } from './bridgePayoutService';
import { BridgeLiquidationService } from './bridgeLiquidationService';
import { BridgeExternalAccountService } from './bridgeExternalAccountService';
import { BridgeTransferService } from './bridgeTransferService';
import { BridgeFundsRequestService } from './bridgeFundsRequestService';

export { BridgeError } from '../lib/bridgeHttp';
export type { BridgeStructuredErrorBody } from '../lib/bridgeHttp';
export { CURRENCY_ENDORSEMENT, resolveEndorsementForCurrency } from '../lib/bridgeEndorsement';
export type { BridgeWebhookSyncContext } from '../lib/bridgeWebhookContext';

export class BridgeService {
  // ── Customer / KYC ──────────────────────────────────────────────────
  static getOrCreateKycLink = BridgeCustomerService.getOrCreateKycLink.bind(BridgeCustomerService);
  static getEndorsementKycLink = BridgeCustomerService.getEndorsementKycLink.bind(BridgeCustomerService);
  static getEndorsementKycLinkForCurrency =
    BridgeCustomerService.getEndorsementKycLinkForCurrency.bind(BridgeCustomerService);
  static getCustomerStatus = BridgeCustomerService.getCustomerStatus.bind(BridgeCustomerService);
  static syncCustomerFromWebhook =
    BridgeCustomerService.syncCustomerFromWebhook.bind(BridgeCustomerService);
  static deleteCustomerForUser =
    BridgeCustomerService.deleteCustomerForUser.bind(BridgeCustomerService);
  static syncKycLinkFromWebhook =
    BridgeCustomerService.syncKycLinkFromWebhook.bind(BridgeCustomerService);

  // ── On-ramp: Virtual Accounts ───────────────────────────────────────
  static getOrCreateVirtualAccount =
    BridgeVirtualAccountService.getOrCreateVirtualAccount.bind(BridgeVirtualAccountService);
  static listVirtualAccounts =
    BridgeVirtualAccountService.listVirtualAccounts.bind(BridgeVirtualAccountService);
  static listDeposits = BridgeVirtualAccountService.listDeposits.bind(BridgeVirtualAccountService);
  static syncDepositsFromBridge =
    BridgeVirtualAccountService.syncDepositsFromBridge.bind(BridgeVirtualAccountService);
  static syncVirtualAccountActivity =
    BridgeVirtualAccountService.syncVirtualAccountActivity.bind(BridgeVirtualAccountService);

  // ── Off-ramp: Payout Liquidation Address ─────────────────────────────
  static listPayoutOptions = BridgePayoutService.listPayoutOptions.bind(BridgePayoutService);
  static getOrCreatePayoutAddress =
    BridgePayoutService.getOrCreatePayoutAddress.bind(BridgePayoutService);
  static listPayoutAddresses =
    BridgePayoutService.listPayoutAddresses.bind(BridgePayoutService);
  static listPayoutDrains = BridgePayoutService.listPayoutDrains.bind(BridgePayoutService);

  // ── Crypto deposit: Liquidation Address ────────────────────────────
  static getOrCreateLiquidationAddress =
    BridgeLiquidationService.getOrCreateLiquidationAddress.bind(BridgeLiquidationService);
  static listLiquidationAddresses =
    BridgeLiquidationService.listLiquidationAddresses.bind(BridgeLiquidationService);
  static syncLiquidationDrainFromWebhook =
    BridgeLiquidationService.syncLiquidationDrainFromWebhook.bind(BridgeLiquidationService);

  // ── Transfers ───────────────────────────────────────────────────────
  static getTransfer = BridgeTransferService.getTransfer.bind(BridgeTransferService);
  static listTransfers = BridgeTransferService.listTransfers.bind(BridgeTransferService);
  static syncTransferFromWebhook =
    BridgeTransferService.syncTransferFromWebhook.bind(BridgeTransferService);

  // ── External Accounts ───────────────────────────────────────────────
  static createExternalAccount =
    BridgeExternalAccountService.createExternalAccount.bind(BridgeExternalAccountService);
  static listExternalAccounts =
    BridgeExternalAccountService.listExternalAccounts.bind(BridgeExternalAccountService);
  static deleteExternalAccount =
    BridgeExternalAccountService.deleteExternalAccount.bind(BridgeExternalAccountService);

  // ── Funds Requests / Fiat Deposit Returns ───────────────────────────
  static listFundsRequestsFromBridge =
    BridgeFundsRequestService.listFundsRequestsFromBridge.bind(BridgeFundsRequestService);
  static syncFundsRequests =
    BridgeFundsRequestService.syncFundsRequests.bind(BridgeFundsRequestService);
  static syncFundsRequestsIfStale =
    BridgeFundsRequestService.syncFundsRequestsIfStale.bind(BridgeFundsRequestService);
  static listLocalFundsRequests =
    BridgeFundsRequestService.listLocalFundsRequests.bind(BridgeFundsRequestService);
  static initiateFiatDepositReturn =
    BridgeFundsRequestService.initiateFiatDepositReturn.bind(BridgeFundsRequestService);
  static markFundsRequestReturnedByDeposit =
    BridgeFundsRequestService.markFundsRequestReturnedByDeposit.bind(BridgeFundsRequestService);
}

/** Deduplicate webhook events: true on insert; false on duplicate (P2002). */
export async function recordWebhookEvent(
  eventId: string,
  eventCategory: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  try {
    await prisma.bridgeWebhookEvent.create({
      data: {
        bridgeEventId: eventId,
        eventCategory,
        eventType,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}
