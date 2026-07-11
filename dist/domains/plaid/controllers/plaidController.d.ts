import { Response, Request } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
export declare const updatePlaidAccountOrder: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createLinkToken: (req: AuthRequest, res: Response) => Promise<void>;
export declare const exchangePublicToken: (req: AuthRequest, res: Response) => Promise<void>;
export declare const disconnectPlaidAccount: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getFinanceSnapshot: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取財務快照（使用緩存，避免過度 API 調用）
 */
export declare const getFinanceSnapshotOptimized: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 手動刷新 Plaid 緩存
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