/**
 * Bridge transfer fetch, list, and webhook sync.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import { appLogger, logDebug, logError } from '../../logger';
import { ReferralCashbackService } from '../../auth/services/referralCashbackService';
import { DemoService } from '../../demo/demoService';
import type {
  BridgeTransferResponse,
  TransferResult,
} from '../models/types';
import { BridgeError, bridgeFetch } from '../lib/bridgeHttp';
import { asJson } from '../lib/bridgeJson';
import type { BridgeWebhookSyncContext } from '../lib/bridgeWebhookContext';

const BRIDGE_TRANSFER_REVERSAL_STATES = new Set(['refunded', 'returned']);

export class BridgeTransferService {
  static async getTransfer(userId: string, bridgeTransferId: string): Promise<TransferResult> {
    if (await DemoService.isDemoUser(userId)) {
      if (!DemoService.bridgeDemoTransferIds().includes(bridgeTransferId)) {
        throw new BridgeError(404, 'Transfer not found for this user.', 'getTransfer');
      }
      const currency = bridgeTransferId.replace('demo-transfer-onramp-', '') || 'usd';
      return DemoService.bridgeTransfer(userId, bridgeTransferId, currency);
    }

    const record = await prisma.bridgeTransfer.findFirst({
      where: { userId, bridgeTransferId },
    });
    if (!record) {
      throw new BridgeError(404, 'Transfer not found for this user.', 'getTransfer');
    }

    const transfer = await bridgeFetch<BridgeTransferResponse>(`/transfers/${bridgeTransferId}`);

    const updated = await prisma.bridgeTransfer.update({
      where: { id: record.id },
      data: {
        state: transfer.state ?? record.state,
        destinationTxHash: transfer.receipt?.destination_tx_hash ?? record.destinationTxHash,
        depositInstructions: transfer.source_deposit_instructions
          ? asJson(transfer.source_deposit_instructions)
          : asJson(record.depositInstructions ?? null),
      },
    });

    return this.toTransferResult(updated);
  }

  static async listTransfers(userId: string, limit = 50): Promise<TransferResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeTransfers(userId);
    }

    const records = await prisma.bridgeTransfer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return records.map((r) => this.toTransferResult(r));
  }

  private static async persistTransfer(
    userId: string,
    bridgeCustomerId: string,
    direction: 'onramp' | 'offramp' | 'crypto',
    transfer: BridgeTransferResponse,
    extra: { destinationAddress?: string; destinationExternalId?: string } = {},
  ): Promise<TransferResult> {
    const data = {
      userId,
      bridgeCustomerId,
      bridgeTransferId: transfer.id,
      direction,
      state: transfer.state ?? 'awaiting_funds',
      amount: transfer.amount ?? null,
      developerFee: transfer.developer_fee ?? null,
      sourceRail: transfer.source?.payment_rail ?? null,
      sourceCurrency: transfer.source?.currency ?? null,
      destinationRail: transfer.destination?.payment_rail ?? null,
      destinationCurrency: transfer.destination?.currency ?? null,
      destinationAddress: transfer.destination?.to_address ?? extra.destinationAddress ?? null,
      destinationExternalId:
        transfer.destination?.external_account_id ?? extra.destinationExternalId ?? null,
      destinationTxHash: transfer.receipt?.destination_tx_hash ?? null,
      depositInstructions: transfer.source_deposit_instructions
        ? asJson(transfer.source_deposit_instructions)
        : Prisma.JsonNull,
      clientReferenceId: transfer.client_reference_id ?? null,
    };

    const record = await prisma.bridgeTransfer.upsert({
      where: { bridgeTransferId: transfer.id },
      create: data,
      update: data,
    });

    appLogger.info('[BridgeService] Transfer created', {
      userId,
      direction,
      bridgeTransferId: transfer.id,
      state: record.state,
    });

    return this.toTransferResult(record);
  }

  private static toTransferResult(
    record: Prisma.BridgeTransferGetPayload<Record<string, never>>,
  ): TransferResult {
    return {
      bridgeTransferId: record.bridgeTransferId,
      direction: record.direction as TransferResult['direction'],
      state: record.state,
      amount: record.amount,
      sourceRail: record.sourceRail,
      sourceCurrency: record.sourceCurrency,
      destinationRail: record.destinationRail,
      destinationCurrency: record.destinationCurrency,
      destinationAddress: record.destinationAddress,
      destinationExternalId: record.destinationExternalId,
      depositInstructions:
        (record.depositInstructions as TransferResult['depositInstructions']) ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  static async syncTransferFromWebhook(
    transfer: BridgeTransferResponse,
    context?: BridgeWebhookSyncContext,
  ): Promise<void> {
    if (!transfer.id) return;
    const existing = await prisma.bridgeTransfer.findUnique({
      where: { bridgeTransferId: transfer.id },
      select: { id: true },
    });
    if (!existing) {
      logDebug('[BridgeService] Webhook transfer not tracked locally', { transferId: transfer.id });
      return;
    }

    await prisma.bridgeTransfer.update({
      where: { id: existing.id },
      data: {
        state: transfer.state ?? undefined,
        ...(transfer.receipt?.destination_tx_hash
          ? { destinationTxHash: transfer.receipt.destination_tx_hash }
          : {}),
        ...(transfer.source_deposit_instructions
          ? { depositInstructions: asJson(transfer.source_deposit_instructions) }
          : {}),
      },
    });

    if (transfer.state === 'payment_processed') {
      const { PlatformRevenueService } = await import('../../platform-insights/services/platformRevenueService');
      await PlatformRevenueService.recordFromBridgeTransfer(transfer.id).catch((err) => {
        logError('[BridgeService] Failed to record platform revenue from transfer', err as Error, {
          bridgeTransferId: transfer.id,
        });
      });
    }

    if (transfer.state && BRIDGE_TRANSFER_REVERSAL_STATES.has(transfer.state)) {
      await ReferralCashbackService.reverseByIdempotencyKey(
        `bridge:transfer:${transfer.id}:payment_processed`,
        'bridge_transfer_refunded',
        context?.webhookEventId ?? `bridge:transfer:${transfer.id}:${transfer.state}`,
      );
    }
  }
}
