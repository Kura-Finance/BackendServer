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
