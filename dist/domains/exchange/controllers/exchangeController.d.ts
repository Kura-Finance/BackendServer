import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
/**
 * 連結交易所帳戶
 * 受用戶等級限制：每天最多連接次數
 */
export declare const connectExchange: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取交易所餘額和資產 (合併端點)
 * 達到查詢上限時返回數據庫緩存內容
 * 受用戶等級限制：每天最多查詢次數
 */
export declare const getExchangeBalances: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取用戶所有交易所帳戶
 */
export declare const getUserExchangeAccounts: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 斷開交易所連接
 */
export declare const disconnectExchange: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取支持的交易所列表
 */
export declare const getSupportedExchanges: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=exchangeController.d.ts.map