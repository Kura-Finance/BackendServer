import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
/**
 * Asset Controller - Request/Response Handling
 */
/**
 * 記錄資產快照
 */
export declare const recordAssetSnapshot: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 批量記錄資產快照
 */
export declare const recordMultipleSnapshots: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取最新資產狀態
 */
export declare const getLatestSnapshot: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取資產歷史數據（用於繪製圖表）
 */
export declare const getAssetHistory: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 刪除特定資產的歷史記錄
 */
export declare const deleteAssetHistory: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取所有記錄日期（用於前端日期選擇器）
 */
export declare const getRecordDates: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=assetController.d.ts.map