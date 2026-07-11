import { Response, Request } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
export declare const createLinkToken: (req: AuthRequest, res: Response) => Promise<void>;
export declare const exchangePublicToken: (req: AuthRequest, res: Response) => Promise<void>;
export declare const disconnectPlaidItem: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getFinanceSnapshot: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取財務快照（仅使用緩存架構）
 * - API 層面只返回數據庫內容，Server 通過 Webhooks 自動更新數據庫
 * - 用戶可通過 ?refresh=true 參數強制更新，但受每日次數限制（基於訂閱等級）
 * - 達到限制時返回緩存數據
 * - Basic: 1次/天, Pro: 5次/天, Ultimate: 20次/天, VIP: 無限
 */
export declare const getFinanceSnapshotOptimized: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 手動刷新 Plaid 緩存
 * 達到限制時返回緩存數據
 */
export declare const refreshPlaidCache: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 清空 Plaid 緩存（完整清除）
 */
export declare const clearPlaidCache: (req: AuthRequest, res: Response) => Promise<void>;
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