/**
 * E2EE Key Pair Service
 *
 * 管理使用者的 X25519 keypair：
 *   publicKey            — 後端用來 wrap SEK（明文存放）
 *   encryptedPrivateKey  — 用 KEK 加密後的 privateKey，後端永遠無法解
 *
 * 流程：
 *   1. 使用者登入後（KEK 在 client 記憶體裡）
 *   2. 客戶端呼叫 GET  /api/auth/keys/me 看自己有沒有 keypair
 *   3. 若沒有：客戶端生成 X25519 keypair → 用 KEK encrypt privateKey →
 *      呼叫 POST /api/auth/keys/setup 上傳 { publicKey, encryptedPrivateKey }
 *   4. 若有：客戶端讀回 encryptedPrivateKey，本地用 KEK 解開 privateKey
 */

import { prisma } from '../../shared/lib/prisma';
import { isValidPublicKeyB64 } from '../../shared/crypto';
import { logDebug, logBusinessEvent } from '../../logger';

const ALGORITHM = 'x25519-xchacha20';

export class KeyPairAlreadyConfiguredError extends Error {
  constructor(public readonly userId: string) {
    super(`User ${userId} already has an E2EE key pair configured`);
    this.name = 'KeyPairAlreadyConfiguredError';
  }
}

export class KeyPairNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`User ${userId} has not configured an E2EE key pair`);
    this.name = 'KeyPairNotFoundError';
  }
}

export class InvalidKeyPairError extends Error {
  constructor(reason: string) {
    super(`Invalid key pair payload: ${reason}`);
    this.name = 'InvalidKeyPairError';
  }
}

export interface KeyPairPayload {
  publicKey: string;            // base64(X25519 public key, 32 bytes)
  encryptedPrivateKey: string;  // base64(KEK-wrapped private key)
  kekSalt?: string;             // Passkey PRF salt (hex) — 後端僅儲存，永不參與推導
}

export interface KeyPairView {
  publicKey: string;
  encryptedPrivateKey: string;
  kekSalt: string | null;
  algorithm: string;
  createdAt: Date;
}

export class KeyPairService {
  /**
   * 首次設定 keypair。
   *
   * 拒絕覆寫：若已有 keypair，丟 KeyPairAlreadyConfiguredError；
   * 想換 keypair 改用 `rotate` 並警告會讓既有 wrappedSek 全部失效。
   */
  static async setup(userId: string, payload: KeyPairPayload): Promise<KeyPairView> {
    this.validatePayload(payload);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { publicKey: true },
    });

    if (existing?.publicKey) {
      throw new KeyPairAlreadyConfiguredError(userId);
    }

    const now = new Date();
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        publicKey: payload.publicKey,
        encryptedPrivateKey: payload.encryptedPrivateKey,
        ...(payload.kekSalt !== undefined && { kekSalt: payload.kekSalt }),
        keyPairAlgorithm: ALGORITHM,
        keyPairCreatedAt: now,
      },
      select: {
        publicKey: true,
        encryptedPrivateKey: true,
        kekSalt: true,
        keyPairAlgorithm: true,
        keyPairCreatedAt: true,
      },
    });

    logBusinessEvent('e2ee_key_pair_setup', userId, { algorithm: ALGORITHM });
    logDebug('E2EE key pair configured', { userId });

    return this.toView(updated);
  }

  /**
   * 取得自己的 keypair（含 encryptedPrivateKey）— 客戶端用 KEK 解開後使用。
   */
  static async getMine(userId: string): Promise<KeyPairView> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        publicKey: true,
        encryptedPrivateKey: true,
        kekSalt: true,
        keyPairAlgorithm: true,
        keyPairCreatedAt: true,
      },
    });

    if (!user?.publicKey || !user?.encryptedPrivateKey) {
      throw new KeyPairNotFoundError(userId);
    }

    return this.toView(user);
  }

  /**
   * 取得僅 publicKey（給後端內部 / 其他 service 用，永遠不會回傳 privateKey）。
   */
  static async getPublicKey(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { publicKey: true },
    });

    if (!user?.publicKey) {
      throw new KeyPairNotFoundError(userId);
    }

    return user.publicKey;
  }

  /**
   * 輪替 keypair。
   *
   * ⚠️ 警告：所有現有的 EncryptedPayloadKey.wrappedSek 都會無法解開，
   * 因為它們是用舊的 publicKey wrap 的。
   * 呼叫前 caller 必須做以下其中一件事：
   *   (a) 先把所有業務資料重新加密（用客戶端解出明文 → 用新 publicKey 重新 wrap）
   *   (b) 接受所有業務 cache 失效，等下次 sync 自動重建
   *
   * PR 1 階段先暴露 API、預設拒絕當 user 已有資料 — 等之後 rotate 工具實作後放行。
   */
  static async rotate(userId: string, payload: KeyPairPayload): Promise<KeyPairView> {
    this.validatePayload(payload);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { publicKey: true },
    });

    if (!existing?.publicKey) {
      throw new KeyPairNotFoundError(userId);
    }

    const now = new Date();
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        publicKey: payload.publicKey,
        encryptedPrivateKey: payload.encryptedPrivateKey,
        ...(payload.kekSalt !== undefined && { kekSalt: payload.kekSalt }),
        keyPairAlgorithm: ALGORITHM,
        keyPairCreatedAt: now,
      },
      select: {
        publicKey: true,
        encryptedPrivateKey: true,
        kekSalt: true,
        keyPairAlgorithm: true,
        keyPairCreatedAt: true,
      },
    });

    logBusinessEvent('e2ee_key_pair_rotated', userId, { algorithm: ALGORITHM });
    logDebug('E2EE key pair rotated', { userId });

    return this.toView(updated);
  }

  // ─────────────────────────────────────────────────────────────
  // helpers
  // ─────────────────────────────────────────────────────────────

  private static validatePayload(payload: KeyPairPayload): void {
    if (!payload.publicKey || !payload.encryptedPrivateKey) {
      throw new InvalidKeyPairError('publicKey and encryptedPrivateKey are required');
    }
    if (!isValidPublicKeyB64(payload.publicKey)) {
      throw new InvalidKeyPairError('publicKey must be a base64 string of 32 bytes (X25519)');
    }
    // encryptedPrivateKey 是 client 自由格式，後端只檢非空 + 上限長度
    if (payload.encryptedPrivateKey.length < 16 || payload.encryptedPrivateKey.length > 2048) {
      throw new InvalidKeyPairError('encryptedPrivateKey length is out of range');
    }
  }

  private static toView(row: {
    publicKey: string | null;
    encryptedPrivateKey: string | null;
    kekSalt: string | null;
    keyPairAlgorithm: string | null;
    keyPairCreatedAt: Date | null;
  }): KeyPairView {
    return {
      publicKey: row.publicKey ?? '',
      encryptedPrivateKey: row.encryptedPrivateKey ?? '',
      kekSalt: row.kekSalt ?? null,
      algorithm: row.keyPairAlgorithm ?? ALGORITHM,
      createdAt: row.keyPairCreatedAt ?? new Date(0),
    };
  }
}
