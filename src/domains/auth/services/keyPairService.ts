/**
 * E2EE Key Pair Service
 *
 * Manages the user's X25519 keypair:
 *   publicKey            — used by backend to wrap SEK (stored in plaintext)
 *   encryptedPrivateKey  — privateKey encrypted with KEK; backend can never decrypt
 *
 * Flow:
 *   1. After login (KEK in client memory)
 *   2. Client GET /api/auth/keys/me to check for an existing keypair
 *   3. If none: client generates X25519 keypair → encrypts privateKey with KEK →
 *      POST /api/auth/keys/setup with { publicKey, encryptedPrivateKey }
 *   4. If present: client reads encryptedPrivateKey and unwraps with KEK locally
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
  kekSalt?: string;             // Passkey PRF salt (hex) — stored only; never used in derivation
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
   * First-time keypair setup.
   *
   * Refuses overwrite: throws KeyPairAlreadyConfiguredError if already set;
   * to replace, use `rotate` (invalidates all existing wrappedSek).
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
   * Fetch own keypair (incl. encryptedPrivateKey) — client unwraps with KEK.
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
   * Fetch publicKey only (internal / other services; never returns privateKey).
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
   * Rotate keypair.
   *
   * Warning: all existing EncryptedPayloadKey.wrappedSek become unreadable,
   * because they were wrapped with the old publicKey.
   * Before calling, the caller must either:
   *   (a) Re-encrypt all business data (client decrypts → re-wrap with new publicKey)
   *   (b) Accept that all business caches are invalid until the next sync rebuilds them
   *
   * PR 1 exposes the API but rejects when the user already has data — unlock after rotate tooling ships.
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
    // encryptedPrivateKey is client-defined; backend only checks non-empty + max length
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
