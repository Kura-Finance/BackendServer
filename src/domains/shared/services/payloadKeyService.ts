/**
 * Payload Key Service
 *
 * Standard flow: create a SEK for one sync round, wrap it, and persist
 * EncryptedPayloadKey.
 *
 * Typical usage (after PR 2):
 *
 *   const { sek, payloadKeyId } = await PayloadKeyService.createForUser(
 *     userId,
 *     `plaid_tx:${plaidItemId}`,
 *   );
 *   try {
 *     // Encrypt rows with sek; write payloadCiphertext + payloadKeyId
 *   } finally {
 *     zeroize(sek);
 *   }
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  generateSEK,
  sealForPublicKey,
  zeroize,
  SEK_BYTES,
} from '../crypto';
import { logDebug } from '../../logger';

/**
 * Caller-supplied prisma client variant. Pass a `Prisma.TransactionClient`
 * from inside an outer `prisma.$transaction` so the EncryptedPayloadKey row
 * is rolled back together with the business rows that reference its id.
 */
export type PayloadKeyDb = Prisma.TransactionClient | typeof prisma;

export class KeyPairNotConfiguredError extends Error {
  constructor(public readonly userId: string) {
    super(`User ${userId} has not configured an E2EE key pair`);
    this.name = 'KeyPairNotConfiguredError';
  }
}

export interface PayloadKeyHandle {
  /** 32-byte session encryption key — caller must zeroize after use */
  sek: Uint8Array;
  /** EncryptedPayloadKey.id for business-row payloadKeyId */
  payloadKeyId: string;
  /** Payload key scope (e.g. "plaid_tx:item-123") for logging */
  scope: string;
  /** Algorithm string; matches EncryptedPayloadKey.algorithm */
  algorithm: string;
}

const ALGORITHM = 'x25519-sealedbox+aes-256-gcm';

export class PayloadKeyService {
  /**
   * Create a new SEK for the given user/scope, wrap with the user's publicKey,
   * persist EncryptedPayloadKey, and return the SEK plus payloadKeyId.
   *
   * Caller must `zeroize(handle.sek)` when finished.
   *
   * Pass `db` to participate in an outer transaction so the
   * `EncryptedPayloadKey` row is rolled back together with the business
   * rows that will reference its `id` via `payloadKeyId`.
   */
  static async createForUser(
    userId: string,
    scope: string,
    db: PayloadKeyDb = prisma,
  ): Promise<PayloadKeyHandle> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { publicKey: true },
    });

    if (!user?.publicKey) {
      throw new KeyPairNotConfiguredError(userId);
    }

    const sek = generateSEK();

    let wrappedSek: string;
    try {
      wrappedSek = await sealForPublicKey(sek, user.publicKey);
    } catch (error) {
      // On seal failure, zeroize SEK before rethrowing — never leave an unwrapped SEK
      zeroize(sek);
      throw error;
    }

    const payloadKey = await db.encryptedPayloadKey.create({
      data: {
        userId,
        scope,
        wrappedSek,
        algorithm: ALGORITHM,
      },
      select: { id: true },
    });

    logDebug('Created encrypted payload key', {
      userId,
      scope,
      payloadKeyId: payloadKey.id,
      sekBytes: SEK_BYTES,
    });

    return {
      sek,
      payloadKeyId: payloadKey.id,
      scope,
      algorithm: ALGORITHM,
    };
  }

  /**
   * Create payload keys for multiple scopes (same user) in one call.
   *
   * E.g. Plaid sync may need independent SEKs for `plaid_tx:itemId`,
   * `plaid_acct:itemId`, and `plaid_inv:itemId`.
   *
   * Returned map keys match the input scope strings.
   */
  static async createForUserScopes(
    userId: string,
    scopes: string[],
    db: PayloadKeyDb = prisma,
  ): Promise<Map<string, PayloadKeyHandle>> {
    const result = new Map<string, PayloadKeyHandle>();
    const created: PayloadKeyHandle[] = [];

    try {
      for (const scope of scopes) {
        const handle = await this.createForUser(userId, scope, db);
        created.push(handle);
        result.set(scope, handle);
      }
      return result;
    } catch (error) {
      // Any scope failure → zeroize all SEKs and rethrow
      created.forEach((h) => zeroize(h.sek));
      throw error;
    }
  }

  /**
   * Delete EncryptedPayloadKey rows no longer referenced by any encrypted
   * cache row (orphan keys).
   *
   * Context: each sync creates a new SEK / EncryptedPayloadKey. Snapshot-mode
   * writers (account / investment / debank: delete + insert) orphan the old
   * key as soon as cache rows are replaced; without GC the table grows forever.
   *
   * Safety:
   *   - Reference set covers all 9 tables that write payloadKeyId; referenced
   *     keys are always kept (mistaken delete makes rows permanently undecryptable).
   *   - Only deletes keys with createdAt older than cutoff (default 60s): writers
   *     that create a key then write cache rows in another transaction finish in
   *     seconds; the cutoff avoids racing in-flight keys.
   *
   * Best-effort: callers should try/catch; GC failure must not fail the main sync.
   */
  static async deleteOrphanedKeys(userId: string, olderThanMs = 60_000): Promise<number> {
    // Most cache tables have nullable payloadKeyId — only collect non-null;
    // AssetSnapshot.payloadKeyId is required, so `{ userId }` is enough.
    const nullableArgs = (): {
      where: { userId: string; payloadKeyId: { not: null } };
      select: { payloadKeyId: true };
      distinct: ['payloadKeyId'];
    } => ({
      where: { userId, payloadKeyId: { not: null } },
      select: { payloadKeyId: true },
      distinct: ['payloadKeyId'],
    });

    const [acct, txn, invAcct, inv, exCache, dbCache, snap] = await Promise.all([
      prisma.plaidAccountCache.findMany(nullableArgs()),
      prisma.plaidTransactionCache.findMany(nullableArgs()),
      prisma.plaidInvestmentAccountCache.findMany(nullableArgs()),
      prisma.plaidInvestmentCache.findMany(nullableArgs()),
      prisma.exchangeCache.findMany(nullableArgs()),
      prisma.deBankCache.findMany(nullableArgs()),
      prisma.assetSnapshot.findMany({
        where: { userId },
        select: { payloadKeyId: true },
        distinct: ['payloadKeyId'],
      }),
    ]);

    const referenced = new Set<string>();
    for (const rows of [acct, txn, invAcct, inv, exCache, dbCache, snap]) {
      for (const r of rows) {
        if (r.payloadKeyId) referenced.add(r.payloadKeyId);
      }
    }

    const cutoff = new Date(Date.now() - olderThanMs);
    const candidates = await prisma.encryptedPayloadKey.findMany({
      where: { userId, createdAt: { lt: cutoff } },
      select: { id: true },
    });

    const orphanIds = candidates.filter((k) => !referenced.has(k.id)).map((k) => k.id);
    if (orphanIds.length === 0) return 0;

    const { count } = await prisma.encryptedPayloadKey.deleteMany({
      where: { userId, id: { in: orphanIds } },
    });

    logDebug('Deleted orphaned encrypted payload keys', { userId, count });
    return count;
  }

  /**
   * Look up wrappedSek + scope + algorithm by payloadKeyId for client reads
   * (client unwraps SEK with privateKey).
   */
  static async getForRead(
    userId: string,
    payloadKeyIds: string[],
  ): Promise<Array<{ id: string; scope: string; wrappedSek: string; algorithm: string }>> {
    if (payloadKeyIds.length === 0) return [];

    const keys = await prisma.encryptedPayloadKey.findMany({
      where: {
        userId,
        id: { in: payloadKeyIds },
      },
      select: { id: true, scope: true, wrappedSek: true, algorithm: true },
    });

    return keys;
  }
}
