/**
 * Prisma JSON helpers and Bridge rejection_reasons normalization.
 */

import { Prisma } from '@prisma/client';
import type { BridgeRejectionReason, BridgeRejectionReasonPublic } from '../models/types';

export function asJson(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/** Normalize Bridge rejection_reasons; skip invalid entries. */
export function normalizeRejectionReasons(raw: unknown): BridgeRejectionReason[] {
  if (!Array.isArray(raw)) return [];
  const out: BridgeRejectionReason[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
    const developerReason =
      typeof row.developer_reason === 'string' ? row.developer_reason.trim() : undefined;
    if (!reason && !developerReason) continue;
    out.push({
      ...(developerReason ? { developer_reason: developerReason } : {}),
      ...(reason ? { reason } : {}),
      created_at: typeof row.created_at === 'string' ? row.created_at : null,
    });
  }
  return out;
}

/** Customer-facing reasons only (excludes developer_reason). */
export function toPublicRejectionReasons(raw: unknown): BridgeRejectionReasonPublic[] {
  return normalizeRejectionReasons(raw)
    .map((r) => {
      const reason = r.reason?.trim();
      if (!reason) return null;
      return {
        reason,
        createdAt: r.created_at ?? null,
      };
    })
    .filter((r): r is BridgeRejectionReasonPublic => r !== null);
}
