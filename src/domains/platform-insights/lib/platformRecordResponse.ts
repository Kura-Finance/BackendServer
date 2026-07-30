/**
 * Map Prisma PlatformRecord rows to API response DTOs.
 */

import type { PlatformRecord } from '@prisma/client';
import type { PlatformRecordResponse } from '../models/types';

/** Serialize a PlatformRecord for HTTP responses. */
export function toPlatformRecordResponse(record: PlatformRecord): PlatformRecordResponse {
  return {
    id: record.id,
    category: record.category,
    userId: record.userId,
    source: record.source,
    eventType: record.eventType,
    idempotencyKey: record.idempotencyKey,
    email: record.email,
    product: record.product,
    processAmount: record.processAmount,
    platformFee: record.platformFee,
    netAmount: record.netAmount,
    currency: record.currency,
    externalId: record.externalId,
    depositId: record.depositId,
    scaAddress: record.scaAddress,
    occurredAt: record.occurredAt.toISOString(),
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
  };
}
