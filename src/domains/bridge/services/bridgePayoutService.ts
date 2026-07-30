/**
 * Off-ramp payout liquidation addresses and drain history.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import { appLogger } from '../../logger';
import { DemoService } from '../../demo/demoService';
import type {
  BridgeDrainListResponse,
  BridgeDrainResponse,
  BridgeLiquidationAddressListResponse,
  BridgeLiquidationAddressResponse,
  CreatePayoutAddressParams,
  PayoutDrainResult,
  PayoutLiquidationAddressResult,
  PayoutOption,
} from '../models/types';
import {
  PAYOUT_LIQUIDATION_SOURCE,
  PAYOUT_OPTION_BASES,
  resolvePayoutMinDeposit,
} from '../models/types';
import { BridgeError, bridgeFetch } from '../lib/bridgeHttp';
import {
  assertOffRampRailCurrency,
  buildPayoutDeveloperFee,
  payoutLiquidationFeePercent,
} from '../lib/bridgeFees';
import {
  buildPayoutDestinationReferenceFields,
  isDuplicateLiquidationAddress,
  matchesPayoutLiquidationRoute,
} from '../lib/bridgeLiquidationHelpers';
import {
  assertEndorsementForCurrency,
  ensureCustomerNamedPayout,
  isBridgeNotFound,
  requireTransactableCustomer,
  resolveUserScaAddress,
  withStaleCustomerGuard,
} from '../lib/bridgeCustomerAccess';

export class BridgePayoutService {
  static listPayoutOptions(): PayoutOption[] {
    return PAYOUT_OPTION_BASES.map((option) => ({
      ...option,
      minDeposit: resolvePayoutMinDeposit(
        option.rail,
        payoutLiquidationFeePercent(option.currency),
      ),
    }));
  }

  static async getOrCreatePayoutAddress(
    userId: string,
    params: CreatePayoutAddressParams,
  ): Promise<PayoutLiquidationAddressResult> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgePayoutAddress(userId, params);
    }

    const bridgeCustomerId = await requireTransactableCustomer(userId);
    const source = PAYOUT_LIQUIDATION_SOURCE;

    assertOffRampRailCurrency(params.destinationRail, params.destinationCurrency);

    const externalAccount = await prisma.bridgeExternalAccount.findFirst({
      where: {
        userId,
        bridgeExternalAccountId: params.externalAccountId,
        active: true,
      },
      select: { currency: true },
    });
    if (!externalAccount) {
      throw new BridgeError(
        404,
        'External account not found for this user.',
        'getOrCreatePayoutAddress',
      );
    }
    if (externalAccount.currency.toLowerCase() !== params.destinationCurrency.toLowerCase()) {
      throw new BridgeError(
        400,
        `External account currency (${externalAccount.currency}) does not match destinationCurrency (${params.destinationCurrency}).`,
        'getOrCreatePayoutAddress',
      );
    }

    await assertEndorsementForCurrency(userId, params.destinationCurrency);

    await ensureCustomerNamedPayout(userId);

    const returnAddress = params.returnAddress ?? (await resolveUserScaAddress(userId));

    const existing = await prisma.bridgeLiquidationAddress.findUnique({
      where: {
        userId_direction_sourceChain_sourceCurrency_destinationRail_destinationCurrency_bridgeExternalAccountId: {
          userId,
          direction: 'out',
          sourceChain: source.sourceChain,
          sourceCurrency: source.sourceCurrency,
          destinationRail: params.destinationRail,
          destinationCurrency: params.destinationCurrency,
          bridgeExternalAccountId: params.externalAccountId,
        },
      },
    });

    if (existing) {
      try {
        const la = await bridgeFetch<BridgeLiquidationAddressResponse>(
          `/customers/${bridgeCustomerId}/liquidation_addresses/${existing.bridgeLiquidationAddressId}`,
        );
        return this.persistPayoutLiquidationAddress(
          userId,
          bridgeCustomerId,
          params,
          returnAddress,
          la,
        );
      } catch (error) {
        if (!isBridgeNotFound(error)) throw error;
        await prisma.bridgeLiquidationAddress
          .delete({ where: { id: existing.id } })
          .catch(() => undefined);
        appLogger.warn('[BridgeService] Stale payout liquidation address, recreating', {
          userId,
          staleId: existing.bridgeLiquidationAddressId,
        });
      }
    }

    const feePercent = payoutLiquidationFeePercent(params.destinationCurrency);
    const idempotencyKey = [
      'la-payout',
      userId,
      source.sourceChain,
      source.sourceCurrency,
      params.destinationRail,
      params.destinationCurrency,
      params.externalAccountId,
    ].join(':');

    let la: BridgeLiquidationAddressResponse;
    try {
      la = await withStaleCustomerGuard(userId, 'getOrCreatePayoutAddress', () =>
        bridgeFetch<BridgeLiquidationAddressResponse>(
          `/customers/${bridgeCustomerId}/liquidation_addresses`,
          {
            method: 'POST',
            idempotencyKey,
            body: {
              chain: source.sourceChain,
              currency: source.sourceCurrency,
              external_account_id: params.externalAccountId,
              destination_payment_rail: params.destinationRail,
              destination_currency: params.destinationCurrency,
              custom_developer_fee_percent: feePercent,
              ...buildPayoutDestinationReferenceFields(
                params.destinationRail,
                params.destinationReference,
              ),
              ...(returnAddress
                ? { return_instructions: { address: returnAddress } }
                : {}),
            },
          },
        ),
      );
    } catch (error) {
      if (!isDuplicateLiquidationAddress(error)) throw error;

      const remote = await this.findRemotePayoutLiquidationAddress(
        bridgeCustomerId,
        params,
      );
      if (!remote) throw error;
      la = remote;
    }

    return this.persistPayoutLiquidationAddress(
      userId,
      bridgeCustomerId,
      params,
      returnAddress,
      la,
    );
  }

  static async listPayoutAddresses(userId: string): Promise<PayoutLiquidationAddressResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgePayoutAddresses(userId);
    }

    const records = await prisma.bridgeLiquidationAddress.findMany({
      where: { userId, direction: 'out', state: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.toPayoutLiquidationAddressResult(r));
  }

  static async listPayoutDrains(
    userId: string,
    bridgeLiquidationAddressId: string,
    limit = 50,
  ): Promise<PayoutDrainResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgePayoutDrains(bridgeLiquidationAddressId);
    }

    const record = await prisma.bridgeLiquidationAddress.findFirst({
      where: { userId, direction: 'out', bridgeLiquidationAddressId },
    });
    if (!record?.bridgeCustomerId) {
      throw new BridgeError(
        404,
        'Payout liquidation address not found for this user.',
        'listPayoutDrains',
      );
    }

    const list = await bridgeFetch<BridgeDrainListResponse>(
      `/customers/${record.bridgeCustomerId}/liquidation_addresses/${bridgeLiquidationAddressId}/drains?limit=${Math.min(Math.max(limit, 1), 200)}`,
    );

    return (list.data ?? []).map((drain) => this.toPayoutDrainResult(drain));
  }

  private static async findRemotePayoutLiquidationAddress(
    bridgeCustomerId: string,
    params: CreatePayoutAddressParams,
  ): Promise<BridgeLiquidationAddressResponse | null> {
    const list = await bridgeFetch<BridgeLiquidationAddressListResponse>(
      `/customers/${bridgeCustomerId}/liquidation_addresses`,
    );
    const match = (list.data ?? []).find((la) => matchesPayoutLiquidationRoute(la, params));
    return match ?? null;
  }

  private static async persistPayoutLiquidationAddress(
    userId: string,
    bridgeCustomerId: string,
    params: CreatePayoutAddressParams,
    returnAddress: string | null,
    la: BridgeLiquidationAddressResponse,
  ): Promise<PayoutLiquidationAddressResult> {
    if (!la.id || !la.address) {
      throw new BridgeError(
        502,
        'Bridge payout liquidation address response missing id or deposit address.',
        'persistPayoutLiquidationAddress',
      );
    }

    const source = PAYOUT_LIQUIDATION_SOURCE;
    const data = {
      userId,
      bridgeCustomerId,
      bridgeLiquidationAddressId: la.id,
      direction: 'out' as const,
      state: la.state ?? 'active',
      sourceChain: la.chain ?? source.sourceChain,
      sourceCurrency: la.currency ?? source.sourceCurrency,
      destinationRail: la.destination_payment_rail ?? params.destinationRail,
      destinationCurrency: la.destination_currency ?? params.destinationCurrency,
      bridgeExternalAccountId: la.external_account_id ?? params.externalAccountId,
      depositAddress: la.address,
      blockchainMemo: la.blockchain_memo ?? null,
      returnAddress,
      developerFeePercent:
        la.custom_developer_fee_percent ?? payoutLiquidationFeePercent(params.destinationCurrency),
    };

    const record = await prisma.bridgeLiquidationAddress.upsert({
      where: { bridgeLiquidationAddressId: la.id },
      create: data,
      update: data,
    });

    appLogger.info('[BridgeService] Payout liquidation address ready', {
      userId,
      bridgeLiquidationAddressId: la.id,
      destinationRail: record.destinationRail,
      destinationCurrency: record.destinationCurrency,
    });

    return this.toPayoutLiquidationAddressResult(record);
  }

  private static toPayoutLiquidationAddressResult(
    record: Prisma.BridgeLiquidationAddressGetPayload<Record<string, never>>,
  ): PayoutLiquidationAddressResult {
    const payoutFee = buildPayoutDeveloperFee(
      record.developerFeePercent,
      record.destinationCurrency,
    );

    return {
      bridgeLiquidationAddressId: record.bridgeLiquidationAddressId,
      state: record.state,
      sourceChain: record.sourceChain,
      sourceCurrency: record.sourceCurrency,
      destinationRail: record.destinationRail,
      destinationCurrency: record.destinationCurrency,
      bridgeExternalAccountId: record.bridgeExternalAccountId ?? '',
      depositAddress: record.depositAddress,
      blockchainMemo: record.blockchainMemo,
      developerFeePercent: payoutFee.developerFeePercent,
      payoutFee,
      minDeposit: resolvePayoutMinDeposit(
        record.destinationRail,
        payoutFee.developerFeePercent,
        record.sourceCurrency,
      ),
      createdAt: record.createdAt.toISOString(),
    };
  }

  private static toPayoutDrainResult(drain: BridgeDrainResponse): PayoutDrainResult {
    return {
      bridgeDrainId: drain.id,
      bridgeLiquidationAddressId: drain.liquidation_address_id ?? '',
      state: drain.state ?? 'unknown',
      amount: drain.amount ?? null,
      currency: drain.currency ?? null,
      depositTxHash: drain.deposit_tx_hash ?? null,
      destination: drain.destination ?? null,
      createdAt: drain.created_at ?? null,
    };
  }
}
