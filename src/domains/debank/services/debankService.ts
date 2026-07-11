import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import {
  DeBankProtocolPosition,
  DeBankProtocolQueryResult,
  DeBankTokenPosition,
  DeBankTokenQueryResult,
} from '../models/types';
import {
  checkApiLimit,
  getApiLimitForTier,
  getUserTier,
  recordApiOperation,
} from '../../shared/lib/apiRateLimitUtil';

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

  static async getUserProtocolPositions(
    userId: string,
    address: string,
    forceRefresh: boolean = false
  ): Promise<DeBankProtocolQueryResult> {
    this.assertValidAddress(address);
    const normalizedAddress = address.toLowerCase();
    const ttlSeconds = this.getCacheTtlSeconds();

    // 僅手動強制刷新才檢查每日額度，普通快取流程不受限制
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
      const cachedRows = await prisma.deBankProtocolCache.findMany({
        where: {
          userId,
          address: normalizedAddress,
          cachedAt: { gte: staleAfter },
        },
        orderBy: { cachedAt: 'desc' },
      });

      if (cachedRows.length > 0) {
        const protocols = cachedRows.map((row) => row.rawData as unknown as DeBankProtocolPosition);
        const latestCachedAt = cachedRows[0]?.cachedAt.toISOString();
        return {
          protocols,
          fromCache: true,
          ...(latestCachedAt ? { cachedAt: latestCachedAt } : {}),
        };
      }
    }

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

    await prisma.$transaction(async (tx) => {
      await tx.deBankProtocolCache.deleteMany({
        where: {
          userId,
          address: normalizedAddress,
        },
      });

      if (protocols.length === 0) {
        return;
      }

      await tx.deBankProtocolCache.createMany({
        data: protocols.map((protocol, index) => ({
          userId,
          address: normalizedAddress,
          protocolId: this.buildStableProtocolId(protocol, index),
          chain: protocol.chain || 'unknown',
          name: protocol.name || 'unknown',
          rawData: protocol as unknown as Prisma.InputJsonValue,
          cacheTtl: ttlSeconds,
          cachedAt: new Date(),
        })),
      });
    });

    // 手動刷新成功後記錄一次 API 操作
    if (forceRefresh) {
      try {
        await recordApiOperation(userId, 'debank_refresh');
      } catch {
        // 不阻塞主流程
      }
    }

    return {
      protocols,
      fromCache: false,
      cachedAt: new Date().toISOString(),
    };
  }

  static async getUserTokenPositions(
    userId: string,
    address: string,
    forceRefresh: boolean = false
  ): Promise<DeBankTokenQueryResult> {
    this.assertValidAddress(address);
    const normalizedAddress = address.toLowerCase();
    const ttlSeconds = this.getCacheTtlSeconds();

    // 僅手動強制刷新才檢查每日額度，普通快取流程不受限制
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
      const cachedRows = await prisma.deBankTokenCache.findMany({
        where: {
          userId,
          address: normalizedAddress,
          cachedAt: { gte: staleAfter },
        },
        orderBy: { cachedAt: 'desc' },
      });

      if (cachedRows.length > 0) {
        const tokens = cachedRows.map((row) => row.rawData as unknown as DeBankTokenPosition);
        const latestCachedAt = cachedRows[0]?.cachedAt.toISOString();
        return {
          tokens,
          fromCache: true,
          ...(latestCachedAt ? { cachedAt: latestCachedAt } : {}),
        };
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

    await prisma.$transaction(async (tx) => {
      await tx.deBankTokenCache.deleteMany({
        where: {
          userId,
          address: normalizedAddress,
        },
      });

      if (tokens.length === 0) {
        return;
      }

      await tx.deBankTokenCache.createMany({
        data: tokens.map((token, index) => ({
          userId,
          address: normalizedAddress,
          chain: token.chain || 'unknown',
          tokenId: this.buildStableTokenId(token, index),
          symbol: token.symbol || 'UNKNOWN',
          name: token.name || token.symbol || 'unknown',
          rawData: token as unknown as Prisma.InputJsonValue,
          cacheTtl: ttlSeconds,
          cachedAt: new Date(),
        })),
      });
    });

    // 手動刷新成功後記錄一次 API 操作
    if (forceRefresh) {
      try {
        await recordApiOperation(userId, 'debank_refresh');
      } catch {
        // 不阻塞主流程
      }
    }

    return {
      tokens,
      fromCache: false,
      cachedAt: new Date().toISOString(),
    };
  }

  static async unlinkUserAddress(
    userId: string,
    address: string,
  ): Promise<{ address: string; deletedProtocolCount: number; deletedTokenCount: number }> {
    this.assertValidAddress(address);
    const normalizedAddress = address.toLowerCase();

    const [deletedProtocols, deletedTokens] = await prisma.$transaction([
      prisma.deBankProtocolCache.deleteMany({
        where: {
          userId,
          address: normalizedAddress,
        },
      }),
      prisma.deBankTokenCache.deleteMany({
        where: {
          userId,
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
