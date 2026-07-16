/**
 * Dinari（tokenized stocks / dShares）Service
 *
 * 使用官方 SDK `@dinari/api-sdk`。
 * Auth：X-API-Key-Id / X-API-Secret-Key（由 SDK 以 apiKeyID / apiSecretKey 帶上）。
 *
 * 模型：User → DinariEntity → DinariAccount（連用戶 SCA）→ DinariOrder
 * 下單為自管錢包模式，走鏈上 EIP155 permit（prepare → 用戶簽 → submit）。
 */

import Dinari from '@dinari/api-sdk';
import { APIError } from '@dinari/api-sdk';
import { prisma } from '../../shared/lib/prisma';
import { appLogger, logDebug, logError } from '../../logger';
import { ReferralCashbackService } from '../../auth/services/referralCashbackService';
import {
  classifyWalletConnectTarget,
  defaultDinariChainId,
  formatDinariFieldErrors,
  normalizeEvmAddress,
  normalizeWalletConnectChainId,
  resolveWalletChainId,
  walletNonceChainCandidates,
} from '../lib/dinariWalletUtil';
import type {
  DinariAccountResult,
  DinariEntityStatus,
  DinariOrderResult,
  KycEmbedResult,
  PrepareMarketOrderParams,
  PrepareOrderResult,
  WalletNonceResult,
} from '../models/types';

export class DinariError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly context: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DinariError';
  }
}

let cachedClient: Dinari | null = null;

function getClient(): Dinari {
  if (cachedClient) return cachedClient;

  const apiKeyID = process.env.DINARI_API_KEY_ID;
  const apiSecretKey = process.env.DINARI_API_SECRET_KEY;
  if (!apiKeyID || !apiSecretKey) {
    throw new DinariError(500, 'DINARI_API_KEY_ID / DINARI_API_SECRET_KEY not configured', 'config');
  }

  const environment = process.env.DINARI_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  cachedClient = new Dinari({ apiKeyID, apiSecretKey, environment });
  return cachedClient;
}

function paymentTokenAddress(): string {
  if (process.env.DINARI_PAYMENT_TOKEN_ADDRESS) {
    return process.env.DINARI_PAYMENT_TOKEN_ADDRESS;
  }
  // Sandbox mockUSD 與 production 皆在 Base 主網（eip155:8453）
  return '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
}

function isSandbox(): boolean {
  return process.env.DINARI_ENVIRONMENT !== 'production';
}

// KYC 為 PASS 才可交易
function canTransact(kycStatus: string): boolean {
  return kycStatus === 'PASS';
}

function extractDinariErrorBody(error: APIError): unknown {
  return (error as { error?: unknown }).error ?? error;
}

function dinariApiErrorMessage(error: APIError, fallback: string): string {
  const summary = formatDinariFieldErrors(extractDinariErrorBody(error));
  return summary ? `${error.message}: ${summary}` : fallback;
}

export class DinariService {
  // ── Entity / KYC ────────────────────────────────────────────────────

  /** 取得或建立使用者對應的 Dinari customer Entity。 */
  static async getOrCreateEntity(userId: string, name?: string): Promise<string> {
    const existing = await prisma.dinariEntity.findUnique({ where: { userId } });
    if (existing) return existing.entityId;

    const client = getClient();
    const entity = await client.v2.entities.create({ name: name || `Kura ${userId.slice(0, 8)}` });

    await prisma.dinariEntity.create({
      data: { userId, entityId: entity.id, kycStatus: 'not_started' },
    });

    appLogger.info('[DinariService] Entity created', { userId, entityId: entity.id });
    return entity.id;
  }

  /** 建立 Dinari 託管 KYC 連結（hosted KYC URL）。 */
  static async createKycEmbed(userId: string, name?: string): Promise<KycEmbedResult> {
    const entityId = await this.getOrCreateEntity(userId, name);
    const client = getClient();
    const embed = await client.v2.entities.kyc.createManagedCheck(entityId);
    return { embedUrl: embed.embed_url, expiresAt: embed.expiration_dt };
  }

  /** 查詢並同步 KYC 狀態。 */
  static async getEntityStatus(userId: string, name?: string): Promise<DinariEntityStatus> {
    const entityId = await this.getOrCreateEntity(userId, name);
    const client = getClient();

    let kycStatus = 'not_started';
    try {
      const info = await client.v2.entities.kyc.retrieve(entityId);
      kycStatus = info.status ?? 'not_started';
    } catch (error) {
      // 尚無 KYC check 時 Dinari 可能回 404；視為 not_started
      logDebug('[DinariService] KYC retrieve returned no data', {
        entityId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await prisma.dinariEntity.update({
      where: { userId },
      data: { kycStatus },
    });

    return { entityId, kycStatus, canTransact: canTransact(kycStatus) };
  }

  // ── Account / Wallet ────────────────────────────────────────────────

  /** 取得或建立使用者的 Dinari 交易帳戶。 */
  static async getOrCreateAccount(userId: string): Promise<DinariAccountResult> {
    const existing = await prisma.dinariAccount.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return {
        accountId: existing.accountId,
        walletAddress: existing.walletAddress,
        walletChainId: existing.walletChainId,
        isActive: existing.isActive,
      };
    }

    const entityId = await this.getOrCreateEntity(userId);
    const client = getClient();
    const account = await client.v2.entities.accounts.create(entityId);

    const record = await prisma.dinariAccount.create({
      data: { userId, entityId, accountId: account.id },
    });

    appLogger.info('[DinariService] Account created', { userId, accountId: account.id });
    return {
      accountId: record.accountId,
      walletAddress: record.walletAddress,
      walletChainId: record.walletChainId,
      isActive: record.isActive,
    };
  }

  /** 取得錢包連接用的 nonce 與待簽訊息。 */
  static async getWalletNonce(
    userId: string,
    walletAddress: string,
    chainId?: string,
  ): Promise<WalletNonceResult> {
    const normalizedWallet = normalizeEvmAddress(walletAddress);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true, scaAddress: true },
    });
    classifyWalletConnectTarget(normalizedWallet, user ?? {});

    const entityStatus = await this.getEntityStatus(userId);
    if (!entityStatus.canTransact) {
      throw new DinariError(
        403,
        `Complete KYC before connecting wallet (status: ${entityStatus.kycStatus}).`,
        'getWalletNonce',
      );
    }

    const { accountId } = await this.getOrCreateAccount(userId);
    const client = getClient();

    let entityId: string | undefined;
    try {
      const account = await client.v2.accounts.retrieve(accountId);
      entityId = account.entity_id;
      appLogger.info('[DinariService] account.retrieve ok', {
        accountId,
        entityId: account.entity_id,
        isActive: account.is_active,
        jurisdiction: account.jurisdiction,
      });

      const entity = await client.v2.entities.retrieveByID(entityId);
      if (!entity.is_kyc_complete) {
        throw new DinariError(
          403,
          `Complete KYC before connecting wallet (Dinari is_kyc_complete=false, status: ${entityStatus.kycStatus}).`,
          'getWalletNonce',
        );
      }
    } catch (error) {
      if (error instanceof DinariError) throw error;
      if (error instanceof APIError && error.status === 404) {
        throw new DinariError(
          409,
          'Dinari account not found in the current sandbox API key. Reset Dinari entity/account or use matching sandbox credentials.',
          'getWalletNonce',
        );
      }
      appLogger.error('[DinariService] account.retrieve failed — accountId may be stale/wrong env', {
        accountId,
        status: error instanceof APIError ? error.status : undefined,
        fieldSummary:
          error instanceof APIError
            ? formatDinariFieldErrors(extractDinariErrorBody(error))
            : undefined,
      });
      throw error;
    }

    let foundAt: { entityId: string; accountId: string; chainId: string } | null = null;
    try {
      const requested = normalizedWallet;
      const entitiesResp = await client.v2.entities.list();
      const entities = entitiesResp.data;

      for (const ent of entities) {
        if (ent.id === entityId) {
          let kycStatus: string | undefined;
          try {
            kycStatus = (await client.v2.entities.kyc.retrieve(ent.id)).status;
          } catch {
            /* 尚無 KYC check */
          }
          appLogger.info('[DinariService] this entity KYC', {
            entityId: ent.id,
            entityType: ent.entity_type,
            isKycComplete: ent.is_kyc_complete,
            kycStatus,
          });
        }
        try {
          const accsResp = await client.v2.entities.accounts.list(ent.id);
          for (const acc of accsResp.data) {
            try {
              const w = await client.v2.accounts.wallet.get(acc.id);
              if (w.address.toLowerCase() === requested) {
                foundAt = { entityId: ent.id, accountId: acc.id, chainId: w.chain_id };
              }
            } catch {
              /* 該 account 沒連 wallet */
            }
          }
        } catch {
          /* 該 entity 列 account 失敗 */
        }
      }

      appLogger.info('[DinariService] global wallet scan', {
        requested,
        thisEntityId: entityId,
        entityCount: entities.length,
        foundAt,
      });
    } catch (error) {
      appLogger.warn('[DinariService] global wallet scan failed', {
        status: error instanceof APIError ? error.status : undefined,
      });
    }

    if (foundAt) {
      if (foundAt.accountId === accountId) {
        await prisma.dinariAccount.update({
          where: { accountId },
          data: { walletAddress: normalizedWallet, walletChainId: foundAt.chainId },
        });
        throw new DinariError(
          409,
          'Wallet is already connected to this Dinari account.',
          'getWalletNonce',
          { accountId, chainId: foundAt.chainId },
        );
      }

      throw new DinariError(
        409,
        `Wallet ${normalizedWallet} is already linked to another Dinari account (${foundAt.accountId}). Use a different wallet or reset the sandbox entity.`,
        'getWalletNonce',
        foundAt,
      );
    }

    try {
      const linked = await client.v2.accounts.wallet.get(accountId);
      const linkedAddress = linked.address.toLowerCase();
      await prisma.dinariAccount.update({
        where: { accountId },
        data: { walletAddress: linkedAddress, walletChainId: linked.chain_id },
      });
      appLogger.warn('[DinariService] Wallet already linked — skipping nonce', {
        accountId,
        linkedAddress,
        linkedChainId: linked.chain_id,
        requested: normalizedWallet,
      });
      throw new DinariError(
        409,
        linkedAddress === normalizedWallet
          ? 'Wallet is already connected to this Dinari account.'
          : `Dinari account is already linked to wallet ${linked.address}.`,
        'getWalletNonce',
        { accountId, linkedAddress, linkedChainId: linked.chain_id },
      );
    } catch (error) {
      if (error instanceof DinariError) throw error;
      const status = error instanceof APIError ? error.status : undefined;
      appLogger.info('[DinariService] No wallet linked yet — requesting nonce', { accountId, status });
    }

    const connectChainId = resolveWalletChainId(normalizedWallet, {
      chainId,
      userWalletAddress: user?.walletAddress,
      userScaAddress: user?.scaAddress,
    });
    const candidates = [
      connectChainId,
      ...walletNonceChainCandidates(chainId).filter((candidate) => candidate !== connectChainId),
    ];

    appLogger.info('[DinariService] getWalletNonce request', {
      userId,
      accountId,
      walletAddress: normalizedWallet,
      connectChainId,
      candidates,
    });

    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        const resp = await client.v2.accounts.wallet.external.getNonce(accountId, {
          chain_id: candidate,
          wallet_address: normalizedWallet,
        });
        appLogger.info('[DinariService] getWalletNonce success', { accountId, chainId: candidate });
        return {
          nonce: resp.nonce,
          message: resp.message,
          chainId: candidate,
          walletAddress: normalizedWallet,
        };
      } catch (error) {
        lastError = error;
        const status = error instanceof APIError ? error.status : undefined;
        appLogger.warn('[DinariService] getWalletNonce attempt failed', {
          accountId,
          chainId: candidate,
          status,
          fieldSummary:
            error instanceof APIError
              ? formatDinariFieldErrors(extractDinariErrorBody(error))
              : undefined,
        });
        if (status !== 422) throw error;
      }
    }

    appLogger.error('[DinariService] getWalletNonce exhausted all chains', { accountId, candidates });
    if (lastError instanceof APIError) {
      const details = extractDinariErrorBody(lastError);
      throw new DinariError(
        422,
        dinariApiErrorMessage(
          lastError,
          'Dinari rejected wallet nonce. Use chainId eip155:8453 for SCA, complete KYC (PASS), and ensure the wallet is not already linked to another account.',
        ),
        'getWalletNonce',
        details,
      );
    }
    throw lastError;
  }

  /** 用簽名連接用戶 SCA 到 Dinari 帳戶。 */
  static async connectWallet(
    userId: string,
    params: { walletAddress: string; chainId?: string; nonce: string; signature: string },
  ): Promise<DinariAccountResult> {
    const normalizedWallet = normalizeEvmAddress(params.walletAddress);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true, scaAddress: true },
    });
    classifyWalletConnectTarget(normalizedWallet, user ?? {});

    const { accountId } = await this.getOrCreateAccount(userId);
    const chainId = resolveWalletChainId(normalizedWallet, {
      chainId: params.chainId,
      userWalletAddress: user?.walletAddress,
      userScaAddress: user?.scaAddress,
    });
    const client = getClient();

    await client.v2.accounts.wallet.external.connect(accountId, {
      chain_id: chainId,
      nonce: params.nonce,
      signature: params.signature,
      wallet_address: normalizedWallet,
    });

    const record = await prisma.dinariAccount.update({
      where: { accountId },
      data: { walletAddress: normalizedWallet, walletChainId: chainId },
    });

    appLogger.info('[DinariService] Wallet connected', { userId, accountId, chainId });
    return {
      accountId: record.accountId,
      walletAddress: record.walletAddress,
      walletChainId: record.walletChainId,
      isActive: record.isActive,
    };
  }

  // ── 行情（market data 代理）─────────────────────────────────────────

  static async listStocks(query: {
    symbols?: string;
    page?: number;
    pageSize?: number;
  }): Promise<unknown> {
    const client = getClient();
    const params: Record<string, unknown> = {};
    if (query.symbols) params.symbols = query.symbols.split(',').map((s) => s.trim()).filter(Boolean);
    if (query.page) params.page = query.page;
    if (query.pageSize) params.page_size = query.pageSize;
    return client.v2.marketData.stocks.list(params as never);
  }

  static async getStockPrice(stockId: string): Promise<unknown> {
    return getClient().v2.marketData.stocks.retrieveCurrentPrice(stockId);
  }

  static async getStockQuote(stockId: string): Promise<unknown> {
    return getClient().v2.marketData.stocks.retrieveCurrentQuote(stockId);
  }

  // ── 下單（市價，EIP155 自管錢包）────────────────────────────────────

  /** 第一步：產生 permit 讓用戶 SCA 簽章。 */
  static async prepareMarketOrder(
    userId: string,
    params: PrepareMarketOrderParams,
  ): Promise<PrepareOrderResult> {
    const account = await this.requireTradableAccount(userId);
    const chainId = account.walletChainId || defaultDinariChainId();
    const paymentToken = paymentTokenAddress();
    const client = getClient();

    const permitInput: Record<string, unknown> = {
      chain_id: chainId,
      order_side: params.side,
      order_type: 'MARKET',
      order_tif: 'DAY',
      payment_token: paymentToken,
      stock_id: params.stockId,
    };
    if (params.side === 'BUY') permitInput.payment_token_quantity = params.paymentTokenQuantity;
    else permitInput.asset_token_quantity = params.assetTokenQuantity;
    if (params.clientOrderId) permitInput.client_order_id = params.clientOrderId;

    const result = await client.v2.accounts.orderRequests.eip155.createPermit(
      account.accountId,
      permitInput as never,
    );

    await prisma.dinariOrder.create({
      data: {
        userId,
        accountId: account.accountId,
        orderRequestId: result.order_request_id,
        stockId: params.stockId,
        side: params.side,
        type: 'MARKET',
        tif: 'DAY',
        status: 'QUOTED',
        chainId,
        paymentToken,
        paymentTokenQuantity:
          params.paymentTokenQuantity !== undefined ? String(params.paymentTokenQuantity) : null,
        assetTokenQuantity:
          params.assetTokenQuantity !== undefined ? String(params.assetTokenQuantity) : null,
        clientOrderId: params.clientOrderId ?? null,
      },
    });

    appLogger.info('[DinariService] Order permit prepared', {
      userId,
      orderRequestId: result.order_request_id,
      side: params.side,
      stockId: params.stockId,
    });

    return { orderRequestId: result.order_request_id, permit: result.permit };
  }

  /** 第二步：用簽名送出 order request。 */
  static async submitOrder(
    userId: string,
    orderRequestId: string,
    permitSignature: string,
  ): Promise<DinariOrderResult> {
    const order = await prisma.dinariOrder.findUnique({ where: { orderRequestId } });
    if (!order || order.userId !== userId) {
      throw new DinariError(404, 'Order request not found for this user.', 'submitOrder');
    }

    const client = getClient();
    const submitted = await client.v2.accounts.orderRequests.eip155.submit(order.accountId, {
      order_request_id: orderRequestId,
      permit_signature: permitSignature,
    });

    const updated = await prisma.dinariOrder.update({
      where: { orderRequestId },
      data: {
        status: submitted.status ?? order.status,
        orderId: submitted.order_id ?? order.orderId,
      },
    });

    appLogger.info('[DinariService] Order submitted', {
      userId,
      orderRequestId,
      status: updated.status,
      orderId: updated.orderId,
    });

    await this.syncReferrableRevenueForOrder(updated);

    return this.toOrderResult(updated);
  }

  /** 同步 order request 狀態（送出後、on-chain order 尚未產生前用）。 */
  static async syncOrderRequest(userId: string, orderRequestId: string): Promise<DinariOrderResult> {
    const order = await prisma.dinariOrder.findUnique({ where: { orderRequestId } });
    if (!order || order.userId !== userId) {
      throw new DinariError(404, 'Order request not found for this user.', 'syncOrderRequest');
    }

    const client = getClient();
    const req = await client.v2.accounts.orderRequests.retrieve(orderRequestId, {
      account_id: order.accountId,
    });

    const orderId = (req as { order_id?: string | null }).order_id ?? order.orderId;
    const updated = await prisma.dinariOrder.update({
      where: { orderRequestId },
      data: { status: req.status ?? order.status, orderId: orderId ?? null },
    });
    await this.syncReferrableRevenueForOrder(updated);
    return this.toOrderResult(updated);
  }

  /** 同步 on-chain order 狀態。 */
  static async syncOrder(userId: string, orderId: string): Promise<DinariOrderResult> {
    const order = await prisma.dinariOrder.findFirst({ where: { userId, orderId } });
    if (!order) {
      throw new DinariError(404, 'Order not found for this user.', 'syncOrder');
    }

    const client = getClient();
    const onchain = await client.v2.accounts.orders.retrieve(orderId, {
      account_id: order.accountId,
    });

    const updated = await prisma.dinariOrder.update({
      where: { id: order.id },
      data: {
        status: (onchain as { status?: string }).status ?? order.status,
      },
    });
    await this.syncReferrableRevenueForOrder(updated);
    return this.toOrderResult(updated);
  }

  /** 列出使用者的 dShare 訂單。 */
  static async listOrders(userId: string): Promise<DinariOrderResult[]> {
    const records = await prisma.dinariOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return records.map((r) => this.toOrderResult(r));
  }

  // ── 持倉 / 現金 ─────────────────────────────────────────────────────

  static async getPortfolio(userId: string): Promise<unknown> {
    const { accountId } = await this.getOrCreateAccount(userId);
    return getClient().v2.accounts.getPortfolio(accountId);
  }

  static async getCashBalances(userId: string): Promise<unknown> {
    const { accountId } = await this.getOrCreateAccount(userId);
    return getClient().v2.accounts.getCashBalances(accountId);
  }

  /** Sandbox：鑄造測試用 mockUSD 到帳戶錢包。 */
  static async mintSandboxTokens(userId: string): Promise<void> {
    if (!isSandbox()) {
      throw new DinariError(400, 'Sandbox faucet is only available in sandbox environment.', 'faucet');
    }
    const account = await this.requireTradableAccount(userId);
    const chainId = account.walletChainId || defaultDinariChainId();
    await getClient().v2.accounts.mintSandboxTokens(account.accountId, {
      chain_id: chainId as never,
    });
    appLogger.info('[DinariService] Sandbox tokens minted', { userId, accountId: account.accountId });
  }

  // ── 私有 helpers ────────────────────────────────────────────────────

  private static async syncReferrableRevenueForOrder(order: {
    userId: string;
    orderRequestId: string;
    orderId: string | null;
    status: string;
    side: string;
    type: string;
    stockId: string | null;
    paymentTokenQuantity: string | null;
    assetTokenQuantity: string | null;
    limitPrice: string | null;
    updatedAt: Date;
  }): Promise<void> {
    const { PlatformRecordService, isDinariOrderCancelled, isDinariOrderFilled } = await import(
      '../../platform-insights/services/platformRevenueService'
    );

    if (isDinariOrderFilled(order.status)) {
      await PlatformRecordService.recordFromDinariOrder(order).catch((err) => {
        logError('[DinariService] Failed to record referrable revenue from order', err as Error, {
          orderRequestId: order.orderRequestId,
          userId: order.userId,
        });
      });
      return;
    }

    if (!isDinariOrderCancelled(order.status)) return;

    const eventId = order.orderId
      ? `dinari:order:${order.orderId}:${order.status.toLowerCase()}`
      : `dinari:order-request:${order.orderRequestId}:${order.status.toLowerCase()}`;

    await ReferralCashbackService.reverseByIdempotencyKey(
      `dinari:order:${order.orderRequestId}:filled`,
      'dinari_order_cancelled',
      eventId,
    ).catch((err) => {
      logError('[DinariService] Failed to reverse referral cashback for cancelled order', err as Error, {
        orderRequestId: order.orderRequestId,
        orderId: order.orderId,
        status: order.status,
        userId: order.userId,
      });
    });
  }

  /** 確認帳戶可交易：KYC PASS + 已連接錢包。 */
  private static async requireTradableAccount(userId: string): Promise<DinariAccountResult> {
    const status = await this.getEntityStatus(userId);
    if (!status.canTransact) {
      throw new DinariError(403, `KYC not passed (status: ${status.kycStatus}).`, 'requireTradableAccount');
    }
    const account = await this.getOrCreateAccount(userId);
    if (!account.walletAddress) {
      throw new DinariError(400, 'No wallet connected: connect a wallet before trading.', 'requireTradableAccount');
    }
    return account;
  }

  private static toOrderResult(record: {
    orderRequestId: string;
    orderId: string | null;
    status: string;
    side: string;
    type: string;
    tif: string;
    stockId: string | null;
    paymentTokenQuantity: string | null;
    assetTokenQuantity: string | null;
    limitPrice: string | null;
    chainId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): DinariOrderResult {
    return {
      orderRequestId: record.orderRequestId,
      orderId: record.orderId,
      status: record.status,
      side: record.side as DinariOrderResult['side'],
      type: record.type as DinariOrderResult['type'],
      tif: record.tif as DinariOrderResult['tif'],
      stockId: record.stockId,
      paymentTokenQuantity: record.paymentTokenQuantity,
      assetTokenQuantity: record.assetTokenQuantity,
      limitPrice: record.limitPrice,
      chainId: record.chainId,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * 帳號刪除時停用所有 Dinari account（best-effort；失敗不阻擋 DB 刪除）。
   * Dinari 無 entity delete API，僅能 deactivate account。
   */
  static async deactivateAccountsForUser(userId: string): Promise<void> {
    if (!process.env.DINARI_API_KEY_ID || !process.env.DINARI_API_SECRET_KEY) {
      logDebug('[DinariService] Skipping Dinari account deactivation — API keys not configured', { userId });
      return;
    }

    const accounts = await prisma.dinariAccount.findMany({
      where: { userId },
      select: { accountId: true },
    });

    if (accounts.length === 0) {
      return;
    }

    const client = getClient();

    for (const account of accounts) {
      try {
        await client.v2.accounts.deactivate(account.accountId);
        appLogger.info('[DinariService] Deactivated Dinari account during account deletion', {
          userId,
          accountId: account.accountId,
        });
      } catch (error) {
        if (error instanceof APIError && error.status === 404) {
          logDebug('[DinariService] Dinari account already removed', {
            userId,
            accountId: account.accountId,
          });
          continue;
        }
        logError('[DinariService] Failed to deactivate Dinari account during account deletion', error as Error, {
          userId,
          accountId: account.accountId,
        });
      }
    }
  }
}
