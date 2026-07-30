/**
 * Waitlist persistence — join, status lookup, and counts (also notifies platform-insights).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import {
  WAITLIST_DEFAULT_PRODUCT,
  type JoinWaitlistParams,
  type JoinWaitlistResult,
  type WaitlistCountResult,
  type WaitlistEntryResult,
  type WaitlistStatusResult,
} from '../models/types';

function toWaitlistEntryResult(entry: {
  id: string;
  email: string;
  product: string;
  name: string | null;
  source: string | null;
  createdAt: Date;
}): WaitlistEntryResult {
  return {
    id: entry.id,
    email: entry.email,
    product: entry.product,
    name: entry.name,
    source: entry.source,
    createdAt: entry.createdAt.toISOString(),
  };
}

function resolveProduct(product?: string): string {
  return product?.trim().toLowerCase() || WAITLIST_DEFAULT_PRODUCT;
}

export class WaitlistService {
  /** Create a waitlist entry (or return existing for the same email+product). */
  static async join(params: JoinWaitlistParams): Promise<JoinWaitlistResult> {
    const product = resolveProduct(params.product);
    const existing = await prisma.waitlistEntry.findUnique({
      where: { email_product: { email: params.email, product } },
    });

    if (existing) {
      const { PlatformRevenueService } = await import('../../platform-insights/services/platformRevenueService');
      await PlatformRevenueService.recordFromWaitlistEntry({
        waitlistEntryId: existing.id,
        email: existing.email,
        product: existing.product,
        source: existing.source,
        name: existing.name,
        occurredAt: existing.createdAt,
        alreadyJoined: true,
      }).catch(() => {});

      return {
        entry: toWaitlistEntryResult(existing),
        alreadyJoined: true,
      };
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        email: params.email,
        product,
        name: params.name ?? null,
        source: params.source ?? null,
        ...(params.metadata ? { metadata: params.metadata as Prisma.InputJsonValue } : {}),
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });

    const { PlatformRevenueService } = await import('../../platform-insights/services/platformRevenueService');
    await PlatformRevenueService.recordFromWaitlistEntry({
      waitlistEntryId: entry.id,
      email: entry.email,
      product: entry.product,
      source: entry.source,
      name: entry.name,
      occurredAt: entry.createdAt,
      alreadyJoined: false,
    }).catch(() => {});

    return {
      entry: toWaitlistEntryResult(entry),
      alreadyJoined: false,
    };
  }

  /** Look up whether an email has joined for a product. */
  static async getStatus(email: string, product?: string): Promise<WaitlistStatusResult> {
    const resolvedProduct = resolveProduct(product);
    const entry = await prisma.waitlistEntry.findUnique({
      where: { email_product: { email, product: resolvedProduct } },
    });

    return {
      joined: Boolean(entry),
      entry: entry ? toWaitlistEntryResult(entry) : null,
    };
  }

  /** Count waitlist entries, optionally filtered by product. */
  static async getCount(product?: string): Promise<WaitlistCountResult> {
    const resolvedProduct = product ? resolveProduct(product) : null;
    const count = await prisma.waitlistEntry.count({
      ...(resolvedProduct ? { where: { product: resolvedProduct } } : {}),
    });

    return { count, product: resolvedProduct };
  }
}
