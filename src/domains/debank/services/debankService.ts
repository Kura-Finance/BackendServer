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
 * Phase 3 Zero-Access E2EE：加密形式 DeBank 協議 / Token 快照。
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
 * DeBank 服務
 * 用於向 DeBank OpenAPI 取得使用者協議資料
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
   * 嘗試為 DeBank sync 建立 SEK。
   *
   * Phase 3 Zero-Access only：使用者沒 keypair → 拋（caller 整個 sync flow 會 fail-fast，
   * 因為 PR 5 已移除 legacy plaintext 寫入路徑）。
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
   * 從 portfolio_item_list 計算單一 protocol 的 net USD value（DeFi 部位淨值）。
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
   * 單顆 token 的 USD 值，優先用 upstream 提供，沒給就用 amount * price。
   */
  private static computeTokenUsdValue(token: DeBankTokenPosition): number {
    const usdValue = Number(token.usd_value);
    if (Number.isFinite(usdValue) && usdValue !== 0) return usdValue;
    const amount = Number(token.amount || 0);
    const price = Number(token.price || 0);
    return amount * price;
  }

  /**
   * 取得指定地址的 DeBank protocol 快照（Phase 3 Zero-Access E2EE only）。
   *
   * 流程：
   *   - forceRefresh=true 或快取過期：呼叫 DeBank API 取得明文 → 加密寫快取 → 回讀加密形式
   *   - 否則：直接回讀加密形式（後端不解密任何 payload）
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

    // 沒強制刷新時，只要快取仍新鮮就直接回讀加密形式
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

    // 走 DeBank API 抓明文
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

    // Phase 3：必須有 keypair。SEK 與 cache 寫入包進同一個 transaction，
    // EncryptedPayloadKey row 與引用它的 cache row 一起 commit / rollback，
    // 避免「key 已建但 createMany 失敗」留下孤兒、以及 GC 在兩者之間誤刪的 race。
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

      // 趁明文還在記憶體 → 加密寫 AssetSnapshot 的 defiProtocol sub-scoped metric
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

      // Best-effort GC：清掉這次 delete + insert 換下來的孤兒 EncryptedPayloadKey。
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
        // 不阻塞主流程
      }
    }

    return this.getEncryptedProtocolPositions(userId, normalizedAddress);
  }

  /**
   * 取得指定地址的 DeBank token 快照（Phase 3 Zero-Access E2EE only）。
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
        // 不阻塞主流程
      }
    }

    return this.getEncryptedTokenPositions(userId, normalizedAddress);
  }

  /**
   * Phase 3 Zero-Access E2EE：取得指定地址的 protocol 加密快照。
   *
   * 後端只 select metadata + payloadCiphertext + payloadKeyId；
   * 前端用 privateKey unwrap payloadKeys 後解 row。
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
   * Phase 3 Zero-Access E2EE：取得指定地址的 EVM token 加密快照。
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
