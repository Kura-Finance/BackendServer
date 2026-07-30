/**
 * Treasury service — multi-treasury workspace persistence and invariants.
 */
import { randomUUID } from 'crypto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '../../shared/lib/prisma';
import type { TreasuryDto, TreasurySource, TreasuryWorkspaceDto } from '../models/types';

type TreasuryRow = {
  id: string;
  name: string;
  address: string;
  source: string;
  saltNonce: string | null;
  createdAt: Date;
};

type ServiceError = Error & { status?: number; code?: string };

function serviceError(message: string, status: number, code: string): ServiceError {
  const err = new Error(message) as ServiceError;
  err.status = status;
  err.code = code;
  return err;
}

/** Lowercase for stable per-user uniqueness (EIP-55 display is client-side). */
function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function newTreasuryId(): string {
  return `try_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

function toDto(row: TreasuryRow): TreasuryDto {
  const source = row.source === 'bound' ? 'bound' : 'created';
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    source,
    createdAt: row.createdAt.toISOString(),
    ...(source === 'created' && row.saltNonce ? { saltNonce: row.saltNonce } : {}),
  };
}

function resolveActive(
  treasuries: TreasuryDto[],
  activeTreasuryId: string | null | undefined,
): string | null {
  if (activeTreasuryId && treasuries.some((t) => t.id === activeTreasuryId)) {
    return activeTreasuryId;
  }
  return treasuries[0]?.id ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2002';
}

function uniqueTargetFields(error: PrismaClientKnownRequestError): string[] {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  return [];
}

export class TreasuryService {
  /** List treasuries and resolve/persist activeTreasuryId. */
  static async getWorkspace(userId: string): Promise<TreasuryWorkspaceDto> {
    const [user, rows] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { activeTreasuryId: true },
      }),
      prisma.treasury.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const treasuries = rows.map(toDto);
    const activeTreasuryId = resolveActive(treasuries, user.activeTreasuryId);

    // Persist soft-corrected active pointer so DB matches what clients see.
    if ((user.activeTreasuryId ?? null) !== activeTreasuryId) {
      await prisma.user.update({
        where: { id: userId },
        data: { activeTreasuryId },
      });
    }

    return { treasuries, activeTreasuryId };
  }

  /** Create a treasury, or activate an existing one with the same address. */
  static async create(
    userId: string,
    input: {
      id?: string;
      name?: string;
      address: string;
      source: TreasurySource;
      saltNonce?: string;
    },
  ): Promise<TreasuryDto> {
    const address = normalizeAddress(input.address);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { scaAddress: true },
    });
    if (user.scaAddress && user.scaAddress.toLowerCase() === address) {
      throw serviceError('Cannot add personal Smart Wallet as a Treasury', 400, 'PERSONAL_SCA');
    }

    const existing = await prisma.treasury.findFirst({
      where: { userId, address },
    });
    if (existing) {
      await prisma.user.update({
        where: { id: userId },
        data: { activeTreasuryId: existing.id },
      });
      return toDto(existing);
    }

    const count = await prisma.treasury.count({ where: { userId } });
    const name = (input.name?.trim() || (count === 0 ? 'Treasury' : `Treasury ${count + 1}`)).slice(
      0,
      64,
    );
    const id = (input.id?.trim() || newTreasuryId()).slice(0, 64);

    if (input.source === 'created') {
      const salt = input.saltNonce ?? '1';
      if (!/^\d+$/.test(salt) || BigInt(salt) < BigInt(1)) {
        throw serviceError('saltNonce must be an integer >= 1', 400, 'INVALID_SALT');
      }
    }

    try {
      const row = await prisma.treasury.create({
        data: {
          id,
          userId,
          name,
          address,
          source: input.source,
          saltNonce: input.source === 'created' ? input.saltNonce ?? '1' : null,
        },
      });
      await prisma.user.update({
        where: { id: userId },
        data: { activeTreasuryId: row.id },
      });
      return toDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const fields = uniqueTargetFields(error as PrismaClientKnownRequestError);
        // Concurrent create of same address → treat as idempotent hit.
        if (fields.includes('userId') || fields.includes('address') || fields.includes('userId_address')) {
          const raced = await prisma.treasury.findFirst({ where: { userId, address } });
          if (raced) {
            await prisma.user.update({
              where: { id: userId },
              data: { activeTreasuryId: raced.id },
            });
            return toDto(raced);
          }
        }
        throw serviceError('Treasury id or address already exists', 409, 'CONFLICT');
      }
      throw error;
    }
  }

  /** Rename a treasury owned by the user. */
  static async rename(userId: string, id: string, name: string): Promise<TreasuryDto> {
    const row = await prisma.treasury.findFirst({ where: { id, userId } });
    if (!row) {
      throw serviceError('Treasury not found', 404, 'NOT_FOUND');
    }
    const updated = await prisma.treasury.update({
      where: { id },
      data: { name: name.trim().slice(0, 64) },
    });
    return toDto(updated);
  }

  /** Delete a treasury and return the updated workspace. */
  static async remove(userId: string, id: string): Promise<TreasuryWorkspaceDto> {
    const row = await prisma.treasury.findFirst({ where: { id, userId } });
    if (!row) {
      throw serviceError('Treasury not found', 404, 'NOT_FOUND');
    }
    await prisma.treasury.delete({ where: { id } });
    // getWorkspace persists the corrected activeTreasuryId
    return this.getWorkspace(userId);
  }

  /** Set activeTreasuryId (null clears; must own the id when set). */
  static async setActive(
    userId: string,
    activeTreasuryId: string | null,
  ): Promise<TreasuryWorkspaceDto> {
    if (activeTreasuryId) {
      const row = await prisma.treasury.findFirst({ where: { id: activeTreasuryId, userId } });
      if (!row) {
        throw serviceError('Treasury not found', 404, 'NOT_FOUND');
      }
    }
    await prisma.user.update({
      where: { id: userId },
      data: { activeTreasuryId },
    });
    return this.getWorkspace(userId);
  }

  /** Replace the full workspace (migration / bulk import). */
  static async replaceAll(
    userId: string,
    input: {
      activeTreasuryId: string | null;
      treasuries: Array<{
        id?: string;
        name?: string;
        address: string;
        source: TreasurySource;
        saltNonce?: string;
        createdAt?: string;
      }>;
    },
  ): Promise<TreasuryWorkspaceDto> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { scaAddress: true },
    });
    const personal = user.scaAddress?.toLowerCase() ?? null;

    const seenAddresses = new Set<string>();
    const seenIds = new Set<string>();
    const prepared: Array<{
      id: string;
      name: string;
      address: string;
      source: TreasurySource;
      saltNonce: string | null;
      createdAt: Date;
    }> = [];

    for (let i = 0; i < input.treasuries.length; i++) {
      const item = input.treasuries[i]!;
      const address = normalizeAddress(item.address);
      if (personal && address === personal) {
        throw serviceError('Cannot add personal Smart Wallet as a Treasury', 400, 'PERSONAL_SCA');
      }
      if (seenAddresses.has(address)) continue;
      seenAddresses.add(address);

      if (item.source === 'created') {
        const salt = item.saltNonce ?? '1';
        if (!/^\d+$/.test(salt) || BigInt(salt) < BigInt(1)) {
          throw serviceError('saltNonce must be an integer >= 1', 400, 'INVALID_SALT');
        }
      }

      let id = (item.id?.trim() || newTreasuryId()).slice(0, 64);
      if (seenIds.has(id)) {
        throw serviceError('Duplicate treasury id in request', 400, 'DUPLICATE_ID');
      }
      seenIds.add(id);

      prepared.push({
        id,
        name: (
          item.name?.trim() ||
          (prepared.length === 0 ? 'Treasury' : `Treasury ${prepared.length + 1}`)
        ).slice(0, 64),
        address,
        source: item.source,
        saltNonce: item.source === 'created' ? item.saltNonce ?? '1' : null,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
      });
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.treasury.deleteMany({ where: { userId } });
        if (prepared.length > 0) {
          await tx.treasury.createMany({
            data: prepared.map((p) => ({
              id: p.id,
              userId,
              name: p.name,
              address: p.address,
              source: p.source,
              saltNonce: p.saltNonce,
              createdAt: p.createdAt,
              updatedAt: new Date(),
            })),
          });
        }
        const active =
          input.activeTreasuryId && prepared.some((p) => p.id === input.activeTreasuryId)
            ? input.activeTreasuryId
            : prepared[0]?.id ?? null;
        await tx.user.update({
          where: { id: userId },
          data: { activeTreasuryId: active },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw serviceError('Treasury id or address already exists', 409, 'CONFLICT');
      }
      throw error;
    }

    return this.getWorkspace(userId);
  }
}
