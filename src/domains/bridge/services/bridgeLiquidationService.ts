/**
 * Crypto deposit liquidation addresses (Tron USDT → Base USDC) and drain sync.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import { appLogger, logError } from '../../logger';
import { ReferralCashbackService } from '../../auth/services/referralCashbackService';
import { DemoService } from '../../demo/demoService';
import type {
  BridgeDrainResponse,
  BridgeLiquidationAddressListResponse,
  BridgeLiquidationAddressResponse,
  CreateLiquidationAddressParams,
  LiquidationAddressResult,
} from '../models/types';
import {
  LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC,
  resolveTronUsdtMinDeposit,
} from '../models/types';
import { BridgeError, bridgeFetch } from '../lib/bridgeHttp';
import {
  buildDepositDeveloperFee,
  cryptoLiquidationFeePercent,
} from '../lib/bridgeFees';
import {
  isDuplicateLiquidationAddress,
  matchesLiquidationRoute,
} from '../lib/bridgeLiquidationHelpers';
import type { BridgeWebhookSyncContext } from '../lib/bridgeWebhookContext';
import {
  isBridgeNotFound,
  requireTransactableCustomer,
  resolveUserScaAddress,
  withStaleCustomerGuard,
} from '../lib/bridgeCustomerAccess';

const BRIDGE_DRAIN_REVERSAL_STATES = new Set(['refunded', 'returned']);

export class BridgeLiquidationService {
  static async getOrCreateLiquidationAddress(
    userId: string,
    params: CreateLiquidationAddressParams = {},
  ): Promise<LiquidationAddressResult> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeLiquidationAddress(userId);
    }

    const bridgeCustomerId = await requireTransactableCustomer(userId);
    const pair = LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC;

    const destinationAddress = params.toAddress ?? (await resolveUserScaAddress(userId));
    if (!destinationAddress) {
      throw new BridgeError(
        400,
        'No destination address: provide toAddress or register scaAddress via PATCH /api/wallet/sca.',
        'getOrCreateLiquidationAddress',
      );
    }

    const existing = await prisma.bridgeLiquidationAddress.findFirst({
      where: {
        userId,
        direction: 'in',
        sourceChain: pair.sourceChain,
        sourceCurrency: pair.sourceCurrency,
        destinationRail: pair.destinationRail,
        destinationCurrency: pair.destinationCurrency,
        bridgeExternalAccountId: null,
      },
    });

    if (existing) {
      try {
        const la = await bridgeFetch<BridgeLiquidationAddressResponse>(
          `/customers/${bridgeCustomerId}/liquidation_addresses/${existing.bridgeLiquidationAddressId}`,
        );
        return this.persistLiquidationAddress(userId, bridgeCustomerId, destinationAddress, la);
      } catch (error) {
        if (!isBridgeNotFound(error)) throw error;
        await prisma.bridgeLiquidationAddress.delete({ where: { id: existing.id } }).catch(() => undefined);
        appLogger.warn('[BridgeService] Stale liquidation address, recreating', {
          userId,
          staleId: existing.bridgeLiquidationAddressId,
        });
      }
    }

    const feePercent = cryptoLiquidationFeePercent();
    const idempotencyKey = `la-tron-base:${userId}:${destinationAddress.toLowerCase()}`;

    let la: BridgeLiquidationAddressResponse;
    try {
      la = await withStaleCustomerGuard(userId, 'getOrCreateLiquidationAddress', () =>
        bridgeFetch<BridgeLiquidationAddressResponse>(
          `/customers/${bridgeCustomerId}/liquidation_addresses`,
          {
            method: 'POST',
            idempotencyKey,
            body: {
              chain: pair.sourceChain,
              currency: pair.sourceCurrency,
              destination_payment_rail: pair.destinationRail,
              destination_currency: pair.destinationCurrency,
              destination_address: destinationAddress,
              custom_developer_fee_percent: feePercent,
              ...(params.returnAddress
                ? { return_instructions: { address: params.returnAddress } }
                : {}),
            },
          },
        ),
      );
    } catch (error) {
      if (!isDuplicateLiquidationAddress(error)) throw error;

      const remote = await this.findRemoteLiquidationAddress(
        bridgeCustomerId,
        pair,
        destinationAddress,
      );
      if (!remote) throw error;
      la = remote;
    }

    return this.persistLiquidationAddress(userId, bridgeCustomerId, destinationAddress, la);
  }

  static async listLiquidationAddresses(userId: string): Promise<LiquidationAddressResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeLiquidationAddresses(userId);
    }

    const records = await prisma.bridgeLiquidationAddress.findMany({
      where: { userId, direction: 'in' },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.toLiquidationAddressResult(r));
  }

  private static async findRemoteLiquidationAddress(
    bridgeCustomerId: string,
    pair: typeof LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC,
    destinationAddress: string,
  ): Promise<BridgeLiquidationAddressResponse | null> {
    const list = await bridgeFetch<BridgeLiquidationAddressListResponse>(
      `/customers/${bridgeCustomerId}/liquidation_addresses`,
    );
    const match = (list.data ?? []).find((la) =>
      matchesLiquidationRoute(la, pair, destinationAddress),
    );
    return match ?? null;
  }

  private static async persistLiquidationAddress(
    userId: string,
    bridgeCustomerId: string,
    destinationAddress: string,
    la: BridgeLiquidationAddressResponse,
  ): Promise<LiquidationAddressResult> {
    if (!la.id || !la.address) {
      throw new BridgeError(
        502,
        'Bridge liquidation address response missing id or deposit address.',
        'persistLiquidationAddress',
      );
    }

    const data = {
      userId,
      bridgeCustomerId,
      bridgeLiquidationAddressId: la.id,
      direction: 'in' as const,
      state: la.state ?? 'active',
      sourceChain: la.chain,
      sourceCurrency: la.currency,
      destinationRail: la.destination_payment_rail ?? LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC.destinationRail,
      destinationCurrency: la.destination_currency ?? LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC.destinationCurrency,
      destinationAddress: la.destination_address ?? destinationAddress,
      depositAddress: la.address,
      blockchainMemo: la.blockchain_memo ?? null,
      developerFeePercent: la.custom_developer_fee_percent ?? cryptoLiquidationFeePercent(),
    };

    const record = await prisma.bridgeLiquidationAddress.upsert({
      where: { bridgeLiquidationAddressId: la.id },
      create: data,
      update: data,
    });

    appLogger.info('[BridgeService] Liquidation address ready', {
      userId,
      bridgeLiquidationAddressId: la.id,
      sourceChain: la.chain,
      sourceCurrency: la.currency,
    });

    return this.toLiquidationAddressResult(record);
  }

  private static toLiquidationAddressResult(
    record: Prisma.BridgeLiquidationAddressGetPayload<Record<string, never>>,
  ): LiquidationAddressResult {
    const depositFee = buildDepositDeveloperFee(
      record.sourceCurrency,
      record.developerFeePercent,
      cryptoLiquidationFeePercent(),
    );

    return {
      bridgeLiquidationAddressId: record.bridgeLiquidationAddressId,
      state: record.state,
      sourceChain: record.sourceChain,
      sourceCurrency: record.sourceCurrency,
      destinationRail: record.destinationRail,
      destinationCurrency: record.destinationCurrency,
      destinationAddress: record.destinationAddress ?? '',
      depositAddress: record.depositAddress,
      blockchainMemo: record.blockchainMemo,
      developerFeePercent: depositFee.developerFeePercent,
      depositFee,
      minDeposit: resolveTronUsdtMinDeposit(depositFee.developerFeePercent),
      createdAt: record.createdAt.toISOString(),
    };
  }

  static async syncLiquidationDrainFromWebhook(
    drain: BridgeDrainResponse,
    context?: BridgeWebhookSyncContext,
  ): Promise<void> {
    if (!drain.id) return;

    const { PlatformRevenueService } = await import('../../platform-insights/services/platformRevenueService');
    await PlatformRevenueService.recordFromBridgeLiquidationDrain(drain).catch((err) => {
      logError('[BridgeService] Failed to record platform revenue from liquidation drain', err as Error, {
        drainId: drain.id,
        liquidationAddressId: drain.liquidation_address_id,
      });
    });

    if (drain.state && BRIDGE_DRAIN_REVERSAL_STATES.has(drain.state)) {
      await ReferralCashbackService.reverseByIdempotencyKey(
        `bridge:liquidation:${drain.id}:payment_processed`,
        'bridge_liquidation_refunded',
        context?.webhookEventId ?? `bridge:liquidation:${drain.id}:${drain.state}`,
      );
    }
  }
}
