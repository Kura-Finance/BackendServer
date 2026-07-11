import { Response, Request } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
export declare const createLinkToken: (req: AuthRequest, res: Response) => Promise<void>;
export declare const exchangePublicToken: (req: AuthRequest, res: Response) => Promise<void>;
export declare const disconnectPlaidItem: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取財務快照（仅使用緩存架構）
 * - API 層面只返回數據庫內容，Server 通過 Webhooks 自動更新數據庫
 * - 用戶可通過 ?refresh=true 參數強制更新，但受每日次數限制（基於訂閱等級）
 * - 達到限制時返回緩存數據
 * - Basic: 1次/天, Pro: 5次/天, Ultimate: 20次/天, VIP: 無限
 */
export declare const getFinanceSnapshotOptimized: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 清空 Plaid 緩存（完整清除）
 */
export declare const clearPlaidCache: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 取得「加密形式」財務快照（Phase 3 Zero-Access E2EE）
 *
 * 回傳：
 *   {
 *     payloadKeys: [{ id, scope, wrappedSek, algorithm }, ...],
 *     accounts:    [{ accountId, plaidItemId, type, bucket, cachedAt, payloadCiphertext, payloadKeyId }, ...],
 *     transactions:[{ transactionId, accountId, date, month, isPending, ..., payloadCiphertext, payloadKeyId }, ...],
 *     investmentAccounts: [{ accountId, cachedAt, payloadCiphertext, payloadKeyId }, ...],
 *     investments: [{ investmentId, accountId, type, ..., payloadCiphertext, payloadKeyId }, ...],
 *     lastSyncedAt
 *   }
 *
 * 前端流程：
 *   1. 用 KEK 解 encryptedPrivateKey → privateKey
 *   2. for each payloadKey: SEK = sealed_box_open(wrappedSek, privateKey, publicKey)
 *   3. for each row: plain = AES-GCM_decrypt(SEK, payloadCiphertext)
 *   4. 合併 metadata + plain → 渲染
 */
export declare const getEncryptedFinanceSnapshot: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取 Plaid 緩存統計信息
 */
export declare const getCacheInfo: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 處理 Plaid Webhook
 * 無需認證 - Plaid 服務直接調用
 */
export declare const handlePlaidWebhook: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=plaidController.d.ts.map