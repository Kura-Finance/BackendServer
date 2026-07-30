/** DeBank service — OpenAPI fetch/cache with Phase 3 Zero-Access E2EE snapshots. */

import { prisma } from '../../shared/lib/prisma';
import {
  DeBankProtocolPosition,
  DeBankTokenPosition,
} from '../models/types';
import {
  checkApiLimit,
  getApiLimitForTier,
  getUserTier,
  recordApiOperation,
} from '../../shared/lib/apiRateLimitUtil';
import { AssetService } from '../../asset/services/assetService';
import { appLogger, logDebug, logError } from '../../logger';
import { encryptPayload, zeroize } from '../../shared/crypto';
import {
  PayloadKeyService,
  KeyPairNotConfiguredError,
  PayloadKeyHandle,
  PayloadKeyDb,
} from '../../shared/services/payloadKeyService';

/**
 * Phase 3 Zero-Access E2EE: encrypted DeBank protocol / token snapshot shapes.
 */
export interface EncryptedDeBankProtocolSnapshot {
  address: string;
  payloadKeys: Array<{ id: string; scope: string; wrappedSek: string; algorithm: string }>;
  protocols: Array<{
    protocolId: string;
    chain: string;
    cachedAt: Date;
    payloadCiphertext: string;
    payloadKeyId: string;
  }>;
}

export interface EncryptedDeBankTokenSnapshot {
  address: string;
  payloadKeys: Array<{ id: string; scope: string; wrappedSek: string; algorithm: string }>;
  tokens: Array<{
    tokenId: string;
    chain: string;
    cachedAt: Date;
    payloadCiphertext: string;
    payloadKeyId: string;
  }>;
}

/**
 * DeBank service — fetch and cache user protocol / token data via DeBank OpenAPI.
 */
export class DeBankService {
  private static readonly DEFAULT_BASE_URL = 'https://pro-openapi.debank.com/v1';
  private static readonly DEFAULT_CACHE_TTL_SECONDS = 300;

  private static getBaseUrl(): string {
    return process.env.DEBANK_BASE_URL || this.DEFAULT_BASE_URL;
  }

  private static getAccessKey(): string {
    const accessKey = process.env.DEBANK_ACCESS_KEY;
    if (!accessKey) {
      throw new Error('DEBANK_ACCESS_KEY is not configured');
    }
    return accessKey;
  }

  private static getCacheTtlSeconds(): number {
    const configured = Number(process.env.DEBANK_CACHE_TTL_SECONDS || this.DEFAULT_CACHE_TTL_SECONDS);
    if (!Number.isFinite(configured) || configured <= 0) {
      return this.DEFAULT_CACHE_TTL_SECONDS;
    }
    return Math.floor(configured);
  }

  private static assertValidAddress(address: string): void {
    const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(address);
    if (!isEvmAddress) {
      throw new Error('Invalid wallet address format');
    }
  }

  private static buildStableProtocolId(protocol: DeBankProtocolPosition, index: number): string {
    if (protocol.id && protocol.id.trim()) {
      return protocol.id.trim();
    }
    return `${protocol.chain || 'unknown'}:${protocol.name || 'unknown'}:${index}`;
  }

  private static buildStableTokenId(token: DeBankTokenPosition, index: number): string {
    if (token.id && token.id.trim()) {
      return token.id.trim();
    }
    return `${token.chain || 'unknown'}:${token.symbol || token.name || 'unknown'}:${index}`;
  }

  /**
   * Create an SEK for a DeBank sync.
   *
   * Phase 3 Zero-Access only: no keypair → throw (caller fail-fasts; PR 5 removed plaintext writes).
   */
  private static async createPayloadKey(
    userId: string,
    scope: string,
    db: PayloadKeyDb = prisma,
  ): Promise<PayloadKeyHandle> {
    try {
      return await PayloadKeyService.createForUser(userId, scope, db);
    } catch (err) {
      if (err instanceof KeyPairNotConfiguredError) {
        appLogger.warn(
          'User has no E2EE key pair — DeBank sync skipped. ' +
          'Client must POST /api/auth/keys/setup before syncing.',
          { userId, scope },
        );
      } else {
        logError('Failed to create DeBank payload key', err, { userId, scope });
      }
      throw err;
    }
  }

  /**
   * Net USD value for one protocol from portfolio_item_list.
   */
  private static computeProtocolNetUsdValue(protocol: DeBankProtocolPosition): number {
    const items = Array.isArray(protocol.portfolio_item_list)
      ? protocol.portfolio_item_list
      : [];
    return items.reduce((sum: number, item: any) => {
      const net = Number(item?.stats?.net_usd_value);
      if (Number.isFinite(net)) return sum + net;
      const asset = Number(item?.stats?.asset_usd_value || 0);
      const debt = Number(item?.stats?.debt_usd_value || 0);
      return sum + (asset - debt);
    }, 0);
  }

  /**
   * USD value for one token; prefer upstream, else amount * price.
   */
  private static computeTokenUsdValue(token: DeBankTokenPosition): number {
    const usdValue = Number(token.usd_value);
    if (Number.isFinite(usdValue) && usdValue !== 0) return usdValue;
    const amount = Number(token.amount || 0);
    const price = Number(token.price || 0);
    return amount * price;
  }

  /**
   * Get DeBank protocol snapshot for an address (Phase 3 Zero-Access E2EE only).
   *
   * Flow:
   *   - forceRefresh or stale cache: DeBank API (plaintext) → encrypt cache → reload encrypted
   *   - else: reload encrypted form only (backend never decrypts payloads)
   */
  static async getUserProtocolPositions(
    userId: string,
    address: string,
    forceRefresh: boolean = false,
  ): Promise<EncryptedDeBankProtocolSnapshot> {
    this.assertValidAddress(address);
    const normalizedAddress = address.toLowerCase();
    const ttlSeconds = this.getCacheTtlSeconds();

    if (forceRefresh) {
      const refreshCheck = await checkApiLimit(userId, 'debank_refresh');
      if (!refreshCheck.canOperate) {
        const tier = await getUserTier(userId);
        const refreshLimit = getApiLimitForTier('debank_refresh', tier);
        const error = new Error(`Daily DeBank refresh limit reached. ${tier} plan allows ${refreshLimit} refreshes per day.`);
        (error as any).statusCode = 429;
        (error as any).refreshLimit = refreshLimit;
        (error as any).refreshCountRemaining = 0;
        throw error;
      }
    }

    // Without force refresh, serve encrypted cache while fresh
    if (!forceRefresh) {
      const staleAfter = new Date(Date.now() - ttlSeconds * 1000);
      const freshRow = await prisma.deBankCache.findFirst({
        where: {
          userId,
          kind: 'protocol',
          address: normalizedAddress,
          cachedAt: { gte: staleAfter },
          NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
        },
        select: { id: true },
      });
      if (freshRow) {
        return this.getEncryptedProtocolPositions(userId, normalizedAddress);
      }
    }

    // Fetch plaintext from DeBank API
    const accessKey = this.getAccessKey();
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/user/all_complex_protocol_list?id=${encodeURIComponent(normalizedAddress)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        AccessKey: accessKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeBank API request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error('Unexpected DeBank API response format');
    }

    const protocols = data as DeBankProtocolPosition[];

    // Phase 3: keypair required. SEK + cache writes share one transaction so
    // EncryptedPayloadKey and referencing cache rows commit/rollback together
    // (avoids orphan keys and GC races between insert steps).
    const sekHandles: PayloadKeyHandle[] = [];
    try {
      await prisma.$transaction(async (tx) => {
        const protocolKey = await this.createPayloadKey(
          userId,
          `debank_protocol:${normalizedAddress}:${Date.now()}`,
          tx,
        );
        sekHandles.push(protocolKey);

        await tx.deBankCache.deleteMany({
          where: {
            userId,
            kind: 'protocol',
            address: normalizedAddress,
          },
        });

        if (protocols.length === 0) {
          return;
        }

        await tx.deBankCache.createMany({
          data: protocols.map((protocol, index) => ({
            userId,
            kind: 'protocol',
            address: normalizedAddress,
            entityId: this.buildStableProtocolId(protocol, index),
            chain: protocol.chain || 'unknown',
            cachedAt: new Date(),
            payloadCiphertext: encryptPayload(protocolKey.sek, {
              name: protocol.name || 'unknown',
              rawData: protocol,
            }),
            payloadKeyId: protocolKey.payloadKeyId,
          })),
        });
      });

      // While plaintext is in memory → encrypt AssetSnapshot defiProtocol sub-scoped metric
      const totalDefiValue = protocols.reduce(
        (sum, p) => sum + this.computeProtocolNetUsdValue(p),
        0,
      );
      try {
        await AssetService.recordSnapshotFromPlaintext(userId, {
          [`defiProtocol:debank:${normalizedAddress}`]: totalDefiValue,
        });
      } catch (err) {
        logDebug('Failed to record encrypted defiProtocol snapshot for debank', {
          userId,
          address: normalizedAddress,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Best-effort GC: remove EncryptedPayloadKey orphans from this delete+insert swap.
      try {
        await PayloadKeyService.deleteOrphanedKeys(userId);
      } catch (gcError) {
        logDebug('Failed to GC orphaned payload keys after debank protocol sync', {
          userId,
          error: gcError instanceof Error ? gcError.message : String(gcError),
        });
      }
    } finally {
      sekHandles.forEach((handle) => zeroize(handle.sek));
    }

    if (forceRefresh) {
      try {
        await recordApiOperation(userId, 'debank_refresh');
      } catch {
        // Do not block the main flow
      }
    }

    return this.getEncryptedProtocolPositions(userId, normalizedAddress);
  }

  /**
   * Get DeBank token snapshot for an address (Phase 3 Zero-Access E2EE only).
   */
  static async getUserTokenPositions(
    userId: string,
    address: string,
    forceRefresh: boolean = false,
  ): Promise<EncryptedDeBankTokenSnapshot> {
    this.assertValidAddress(address);
    const normalizedAddress = address.toLowerCase();
    const ttlSeconds = this.getCacheTtlSeconds();

    if (forceRefresh) {
      const refreshCheck = await checkApiLimit(userId, 'debank_refresh');
      if (!refreshCheck.canOperate) {
        const tier = await getUserTier(userId);
        const refreshLimit = getApiLimitForTier('debank_refresh', tier);
        const error = new Error(`Daily DeBank refresh limit reached. ${tier} plan allows ${refreshLimit} refreshes per day.`);
        (error as any).statusCode = 429;
        (error as any).refreshLimit = refreshLimit;
        (error as any).refreshCountRemaining = 0;
        throw error;
      }
    }

    if (!forceRefresh) {
      const staleAfter = new Date(Date.now() - ttlSeconds * 1000);
      const freshRow = await prisma.deBankCache.findFirst({
        where: {
          userId,
          kind: 'token',
          address: normalizedAddress,
          cachedAt: { gte: staleAfter },
          NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
        },
        select: { id: true },
      });
      if (freshRow) {
        return this.getEncryptedTokenPositions(userId, normalizedAddress);
      }
    }

    const accessKey = this.getAccessKey();
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/user/all_token_list?id=${encodeURIComponent(normalizedAddress)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        AccessKey: accessKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeBank API request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error('Unexpected DeBank API response format');
    }

    const tokens = data as DeBankTokenPosition[];

    const sekHandles: PayloadKeyHandle[] = [];
    try {
      await prisma.$transaction(async (tx) => {
        const tokenKey = await this.createPayloadKey(
          userId,
          `debank_token:${normalizedAddress}:${Date.now()}`,
          tx,
        );
        sekHandles.push(tokenKey);

        await tx.deBankCache.deleteMany({
          where: {
            userId,
            kind: 'token',
            address: normalizedAddress,
          },
        });

        if (tokens.length === 0) {
          return;
        }

        await tx.deBankCache.createMany({
          data: tokens.map((token, index) => ({
            userId,
            kind: 'token',
            address: normalizedAddress,
            chain: token.chain || 'unknown',
            entityId: this.buildStableTokenId(token, index),
            cachedAt: new Date(),
            payloadCiphertext: encryptPayload(tokenKey.sek, {
              symbol: token.symbol || 'UNKNOWN',
              name: token.name || token.symbol || 'unknown',
              rawData: token,
            }),
            payloadKeyId: tokenKey.payloadKeyId,
          })),
        });
      });

      const totalSpotValue = tokens.reduce(
        (sum, t) => sum + this.computeTokenUsdValue(t),
        0,
      );
      try {
        await AssetService.recordSnapshotFromPlaintext(userId, {
          [`cryptoSpot:debank:${normalizedAddress}`]: totalSpotValue,
        });
      } catch (err) {
        logDebug('Failed to record encrypted cryptoSpot snapshot for debank', {
          userId,
          address: normalizedAddress,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        await PayloadKeyService.deleteOrphanedKeys(userId);
      } catch (gcError) {
        logDebug('Failed to GC orphaned payload keys after debank token sync', {
          userId,
          error: gcError instanceof Error ? gcError.message : String(gcError),
        });
      }
    } finally {
      sekHandles.forEach((handle) => zeroize(handle.sek));
    }

    if (forceRefresh) {
      try {
        await recordApiOperation(userId, 'debank_refresh');
      } catch {
        // Do not block the main flow
      }
    }

    return this.getEncryptedTokenPositions(userId, normalizedAddress);
  }

  /**
   * Phase 3 Zero-Access E2EE: load encrypted protocol snapshot for an address.
   *
   * Selects metadata + payloadCiphertext + payloadKeyId only;
   * client unwraps payloadKeys then decrypts rows.
   */
  static async getEncryptedProtocolPositions(
    userId: string,
    address: string,
  ): Promise<EncryptedDeBankProtocolSnapshot> {
    this.assertValidAddress(address);
    const normalizedAddress = address.toLowerCase();

    const rows = await prisma.deBankCache.findMany({
      where: {
        userId,
        kind: 'protocol',
        address: normalizedAddress,
        NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
      },
      select: {
        entityId: true,
        chain: true,
        cachedAt: true,
        payloadCiphertext: true,
        payloadKeyId: true,
      },
      orderBy: { cachedAt: 'desc' },
    });

    const protocols = rows
      .filter((r: any) => r.payloadCiphertext && r.payloadKeyId)
      .map((r: any) => ({
        protocolId: r.entityId,
        chain: r.chain,
        cachedAt: r.cachedAt,
        payloadCiphertext: r.payloadCiphertext as string,
        payloadKeyId: r.payloadKeyId as string,
      }));

    const payloadKeyIds = Array.from(new Set(protocols.map((p) => p.payloadKeyId)));
    const payloadKeys = await PayloadKeyService.getForRead(userId, payloadKeyIds);

    return {
      address: normalizedAddress,
      payloadKeys,
      protocols,
    };
  }

  /**
   * Phase 3 Zero-Access E2EE: load encrypted EVM token snapshot for an address.
   */
  static async getEncryptedTokenPositions(
    userId: string,
    address: string,
  ): Promise<EncryptedDeBankTokenSnapshot> {
    this.assertValidAddress(address);
    const normalizedAddress = address.toLowerCase();

    const rows = await prisma.deBankCache.findMany({
      where: {
        userId,
        kind: 'token',
        address: normalizedAddress,
        NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
      },
      select: {
        entityId: true,
        chain: true,
        cachedAt: true,
        payloadCiphertext: true,
        payloadKeyId: true,
      },
      orderBy: { cachedAt: 'desc' },
    });

    const tokens = rows
      .filter((r: any) => r.payloadCiphertext && r.payloadKeyId)
      .map((r: any) => ({
        tokenId: r.entityId,
        chain: r.chain,
        cachedAt: r.cachedAt,
        payloadCiphertext: r.payloadCiphertext as string,
        payloadKeyId: r.payloadKeyId as string,
      }));

    const payloadKeyIds = Array.from(new Set(tokens.map((t) => t.payloadKeyId)));
    const payloadKeys = await PayloadKeyService.getForRead(userId, payloadKeyIds);

    return {
      address: normalizedAddress,
      payloadKeys,
      tokens,
    };
  }

  static async unlinkUserAddress(
    userId: string,
    address: string,
  ): Promise<{ address: string; deletedProtocolCount: number; deletedTokenCount: number }> {
    this.assertValidAddress(address);
    const normalizedAddress = address.toLowerCase();

    const [deletedProtocols, deletedTokens] = await prisma.$transaction([
      prisma.deBankCache.deleteMany({
        where: {
          userId,
          kind: 'protocol',
          address: normalizedAddress,
        },
      }),
      prisma.deBankCache.deleteMany({
        where: {
          userId,
          kind: 'token',
          address: normalizedAddress,
        },
      }),
    ]);

    return {
      address: normalizedAddress,
      deletedProtocolCount: deletedProtocols.count,
      deletedTokenCount: deletedTokens.count,
    };
  }
}
