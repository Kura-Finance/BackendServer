/**
 * Payload Key Service
 *
 * 封裝「為一輪同步建立一把 SEK，wrap 後寫入 EncryptedPayloadKey」的標準流程。
 *
 * 典型用法（PR 2 之後）：
 *
 *   const { sek, payloadKeyId } = await PayloadKeyService.createForUser(
 *     userId,
 *     `plaid_tx:${plaidItemId}`,
 *   );
 *   try {
 *     // 用 sek 加密所有 row，把 payloadCiphertext + payloadKeyId 寫入業務表
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
  /** 32-byte session encryption key — caller 必須在用完後 zeroize */
  sek: Uint8Array;
  /** EncryptedPayloadKey.id，寫入業務 row 的 payloadKeyId 用 */
  payloadKeyId: string;
  /** 該 payload key 的 scope（例如 "plaid_tx:item-123"），方便 log */
  scope: string;
  /** 演算法字串，會與 EncryptedPayloadKey.algorithm 一致 */
  algorithm: string;
}

const ALGORITHM = 'x25519-sealedbox+aes-256-gcm';

export class PayloadKeyService {
  /**
   * 為指定 user / scope 建立一把新的 SEK，
   * 用該 user 的 publicKey 包裝後寫入 EncryptedPayloadKey 表，
   * 回傳 SEK 和對應的 payloadKeyId。
   *
   * 流程結束後 caller 必須 `zeroize(handle.sek)`。
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
      // sealing 失敗就直接清掉 SEK 再拋；不留下未 wrap 的 SEK
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
   * 一次性建立多個 scope 的 payload key（同 user）。
   *
   * 例如 Plaid sync 需要 `plaid_tx:itemId`、`plaid_acct:itemId`、`plaid_inv:itemId`
   * 三把獨立 SEK 時可以一次拿。
   *
   * 回傳的 map key 對應傳入的 scope 字串。
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
      // 任何一個 scope 失敗 → 全部 SEK 清掉並拋
      created.forEach((h) => zeroize(h.sek));
      throw error;
    }
  }

  /**
   * 清掉「不再被任何加密快取 row 引用」的 EncryptedPayloadKey（孤兒 key）。
   *
   * 背景：每輪 sync 都會建新的 SEK / EncryptedPayloadKey。snapshot 模式
   * （account / investment / debank：delete + insert）的舊 key 在 cache row
   * 被換掉後立刻變孤兒；長期使用者的 EncryptedPayloadKey 表會無限成長。
   *
   * 安全性：
   *   - 參照集涵蓋所有 9 張會寫 payloadKeyId 的表，referenced 的 key 一律保留，
   *     避免誤刪仍在用的 key（誤刪會讓對應 row 永久無法解密）。
   *   - 只刪 createdAt 早於 cutoff（預設 60s）的 key：任何「先建 key、後在另一個
   *     transaction 寫 cache row」的 writer 都會在數秒內完成，cutoff 確保
   *     in-flight 的新 key 不會被當成孤兒刪掉（防 race）。
   *
   * Best-effort：呼叫端應 try/catch 包起來，GC 失敗不影響主 sync 流程。
   */
  static async deleteOrphanedKeys(userId: string, olderThanMs = 60_000): Promise<number> {
    // payloadKeyId 在大多數 cache 表是 nullable，只收非 null 的；
    // AssetSnapshot.payloadKeyId 是 required，故用 { userId } 即可。
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
   * 由 payloadKeyId 反查 wrappedSek + scope + algorithm，
   * 給前端讀取流程使用（前端拿到 wrappedSek 後用 privateKey 解開 SEK）。
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
